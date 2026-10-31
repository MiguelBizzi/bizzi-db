import { describe, expect, test } from 'bun:test';
import type { IndexDefinition, TableSchema } from '../../../types';
import { createIndex, dropIndex, emptyIndexDraft, planIndexChange } from './indexDdl';

const table = { schema: 'shop', name: 'users', columns: [], indexes: [] } as unknown as TableSchema;
const ctx = { table, tables: [table] };

describe('mysql index ddl', () => {
  test('emits prefix, descending, functional, invisible and inplace', () => {
    const draft = {
      ...emptyIndexDraft(table),
      name: 'users_email',
      method: 'btree',
      keys: [
        { kind: 'column' as const, value: 'email(20)', descending: true, nulls: 'default' as const, opclass: '', collation: '' },
        { kind: 'expression' as const, value: 'lower(email)', descending: false, nulls: 'default' as const, opclass: '', collation: '' },
      ],
      invisible: true,
      concurrently: true,
      comment: 'lookup',
    };
    const plan = createIndex(draft, ctx);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toBe(
      "CREATE INDEX `users_email` ON `shop`.`users` (`email`(20) DESC, (lower(email))) USING BTREE INVISIBLE COMMENT 'lookup' ALGORITHM=INPLACE, LOCK=NONE;",
    );
    expect(plan.transactional).toBe(false);
  });

  test('rebuilds with one ALTER and drops the primary key separately', () => {
    const original = { name: 'users_org', type: 'BTREE', columns: ['organization_id'], isUnique: false, keys: [] } as IndexDefinition;
    const draft = {
      ...emptyIndexDraft(table),
      name: 'users_org',
      keys: [{ kind: 'column' as const, value: 'organization_id', descending: false, nulls: 'default' as const, opclass: '', collation: '' }, { kind: 'column' as const, value: 'email', descending: false, nulls: 'default' as const, opclass: '', collation: '' }],
    };
    const plan = planIndexChange(original, draft, ctx);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('DROP INDEX `users_org`, ADD INDEX `users_org`');
    const dropped = dropIndex({ ...original, isPrimary: true, name: 'PRIMARY' }, table, { concurrently: false });
    expect(dropped.ok && dropped.statements[0]).toBe('ALTER TABLE `shop`.`users` DROP PRIMARY KEY;');
    const online = dropIndex(original, table, { concurrently: true });
    expect(online.ok && online.statements[0]).toBe(
      'DROP INDEX `users_org` ON `shop`.`users` ALGORITHM=INPLACE, LOCK=NONE;',
    );
  });
});
