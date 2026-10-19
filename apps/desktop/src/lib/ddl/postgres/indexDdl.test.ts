import { describe, expect, test } from 'bun:test';
import type { IndexDefinition, TableSchema } from '../../../types';
import { planScript, type DdlPlan, type IndexContext, type IndexDraft } from '../types';
import {
  createIndex,
  dropIndex,
  emptyIndexDraft,
  indexDraftFrom,
  planIndexChange,
  suggestIndexName,
  validateIndex,
} from './indexDdl';

function table(overrides: Partial<TableSchema> = {}): TableSchema {
  return {
    id: 'shop.orders',
    name: 'orders',
    schema: 'shop',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: [
      { name: 'id', type: 'bigint', isPrimary: true },
      { name: 'user_id', type: 'bigint' },
      { name: 'status', type: 'text' },
      { name: 'total', type: 'numeric' },
      { name: 'Placed At', type: 'timestamptz' },
    ],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function index(overrides: Partial<IndexDefinition> = {}): IndexDefinition {
  return {
    name: 'idx_orders_user',
    columns: ['user_id'],
    isUnique: false,
    type: 'BTREE',
    keys: [{ expression: 'user_id', isExpression: false, descending: false }],
    includeColumns: [],
    isValid: true,
    storageParams: [],
    ...overrides,
  };
}

function ctx(t = table(), serverVersionNum = 160_000): IndexContext {
  return { table: t, tables: [t], serverVersionNum };
}

function draft(overrides: Partial<IndexDraft> = {}): IndexDraft {
  return {
    ...emptyIndexDraft(table()),
    name: 'idx_orders_user',
    keys: [
      { kind: 'column', value: 'user_id', descending: false, nulls: 'default', opclass: '', collation: '' },
    ],
    ...overrides,
  };
}

function plan(result: ReturnType<typeof createIndex>): DdlPlan {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('createIndex', () => {
  test('quotes names and writes the method explicitly', () => {
    expect(planScript(plan(createIndex(draft(), ctx())))).toBe(
      'CREATE INDEX "idx_orders_user" ON "shop"."orders" USING btree ("user_id");'
    );
  });

  test('writes every PostgreSQL option in grammar order', () => {
    const sql = planScript(
      plan(
        createIndex(
          draft({
            name: 'we"ird',
            unique: true,
            keys: [
              { kind: 'column', value: 'Placed At', descending: true, nulls: 'last', opclass: '', collation: '' },
              { kind: 'expression', value: 'lower(status)', descending: false, nulls: 'first', opclass: 'text_pattern_ops', collation: '"C"' },
            ],
            include: ['total'],
            nullsNotDistinct: true,
            storageParams: [{ name: 'fillfactor', value: '80' }],
            tablespace: 'fast',
            predicate: 'status <> \'void\'',
            ifNotExists: true,
          }),
          ctx()
        )
      )
    );
    expect(sql).toBe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "we""ird" ON "shop"."orders" USING btree ' +
        '("Placed At" DESC NULLS LAST, (lower(status)) COLLATE "C" text_pattern_ops NULLS FIRST) ' +
        'INCLUDE ("total") NULLS NOT DISTINCT WITH (fillfactor = 80) TABLESPACE "fast" ' +
        "WHERE status <> 'void';"
    );
  });

  test('CONCURRENTLY is never transactional', () => {
    const result = plan(createIndex(draft({ concurrently: true }), ctx()));
    expect(result.statements[0]).toStartWith('CREATE INDEX CONCURRENTLY ');
    expect(result.transactional).toBe(false);
  });

  test('refuses an invalid draft', () => {
    const result = createIndex(draft({ keys: [] }), ctx());
    expect(result.ok).toBe(false);
  });
});

describe('validateIndex', () => {
  test('requires a name and at least one key', () => {
    expect(validateIndex(draft({ name: ' ', keys: [] }), ctx())).toEqual([
      'Index name is required.',
      'Add at least one column or expression.',
    ]);
  });

  test('checks columns exist and the method supports the options', () => {
    const errors = validateIndex(
      draft({
        method: 'gin',
        unique: true,
        keys: [
          { kind: 'column', value: 'nope', descending: true, nulls: 'default', opclass: '', collation: '' },
        ],
        include: ['total'],
      }),
      ctx()
    );
    expect(errors).toContain('Column "nope" does not exist on shop.orders.');
    expect(errors).toContain('GIN indexes cannot be unique.');
    expect(errors).toContain('GIN indexes have no key ordering (ASC/DESC, NULLS).');
    expect(errors).toContain('GIN indexes do not support INCLUDE columns on this server.');
  });

  test('rejects names already used in the schema', () => {
    const t = table({ indexes: [index({ name: 'taken' })] });
    expect(validateIndex(draft({ name: 'taken' }), ctx(t))).toContain(
      'An index or table named "taken" already exists in shop.'
    );
    expect(validateIndex(draft({ name: 'orders' }), ctx(t))).toContain(
      'An index or table named "orders" already exists in shop.'
    );
    expect(validateIndex(draft({ name: 'taken' }), ctx(t), index({ name: 'taken' }))).toEqual([]);
  });

  test('NULLS NOT DISTINCT needs a unique index and PostgreSQL 15', () => {
    expect(validateIndex(draft({ nullsNotDistinct: true }), ctx())).toContain(
      'NULLS NOT DISTINCT only applies to unique indexes.'
    );
    expect(
      validateIndex(draft({ unique: true, nullsNotDistinct: true }), ctx(table(), 140_000))
    ).toContain('NULLS NOT DISTINCT needs PostgreSQL 15 or later.');
  });

  test('storage params must be known for the method and have safe values', () => {
    const errors = validateIndex(
      draft({
        storageParams: [
          { name: 'fastupdate', value: 'on' },
          { name: 'fillfactor', value: '5' },
          { name: 'fillfactor', value: '80); DROP TABLE x; --' },
        ],
      }),
      ctx()
    );
    expect(errors).toContain('B-tree indexes have no storage parameter "fastupdate".');
    expect(errors).toContain('fillfactor must be a whole number from 10 to 100.');
  });

  test('name length is limited to 63 bytes', () => {
    expect(validateIndex(draft({ name: 'x'.repeat(64) }), ctx())).toContain(
      'Index name is longer than 63 bytes.'
    );
  });
});

describe('suggestIndexName', () => {
  test('follows the PostgreSQL naming pattern and avoids collisions', () => {
    expect(suggestIndexName(draft(), ctx())).toBe('orders_user_id_idx');
    const t = table({ indexes: [index({ name: 'orders_user_id_idx' })] });
    expect(suggestIndexName(draft(), ctx(t))).toBe('orders_user_id_idx1');
    expect(
      suggestIndexName(
        draft({
          unique: true,
          keys: [
            { kind: 'expression', value: 'lower(status)', descending: false, nulls: 'default', opclass: '', collation: '' },
          ],
        }),
        ctx()
      )
    ).toBe('orders_expr_key');
  });
});

describe('indexDraftFrom', () => {
  test('round-trips an introspected index', () => {
    const d = indexDraftFrom(
      index({
        type: 'BTREE',
        keys: [
          { expression: 'user_id', isExpression: false, descending: true, nullsFirst: false },
          { expression: 'lower(status)', isExpression: true, descending: false, opclass: 'text_pattern_ops' },
        ],
        includeColumns: ['total'],
        predicate: 'total > 0',
        storageParams: [{ name: 'fillfactor', value: '70' }],
      })
    );
    expect(d.method).toBe('btree');
    expect(d.keys[0]).toMatchObject({ kind: 'column', value: 'user_id', descending: true, nulls: 'last' });
    expect(d.keys[1]).toMatchObject({ kind: 'expression', value: 'lower(status)', opclass: 'text_pattern_ops' });
    expect(d.include).toEqual(['total']);
    expect(d.predicate).toBe('total > 0');
  });

  test('falls back to plain columns for older payloads without keys', () => {
    const d = indexDraftFrom({ name: 'i', columns: ['a', 'b'], isUnique: true, type: 'BTREE' });
    expect(d.keys.map((key) => key.value)).toEqual(['a', 'b']);
    expect(d.unique).toBe(true);
  });
});

describe('planIndexChange', () => {
  const original = index({ storageParams: [{ name: 'fillfactor', value: '70' }] });
  const t = table({ indexes: [original] });
  const base = () => indexDraftFrom(original);

  test('no change runs nothing', () => {
    const result = plan(planIndexChange(original, base(), ctx(t)));
    expect(result.mode).toBe('none');
    expect(result.statements).toEqual([]);
  });

  test('rename, storage params and tablespace use ALTER INDEX', () => {
    const result = plan(
      planIndexChange(
        original,
        {
          ...base(),
          name: 'idx_orders_by_user',
          storageParams: [{ name: 'deduplicate_items', value: 'off' }],
          tablespace: 'fast',
        },
        ctx(t)
      )
    );
    expect(result.mode).toBe('alter');
    expect(result.transactional).toBe(true);
    expect(result.statements).toEqual([
      'ALTER INDEX "shop"."idx_orders_user" SET (deduplicate_items = off);',
      'ALTER INDEX "shop"."idx_orders_user" RESET (fillfactor);',
      'ALTER INDEX "shop"."idx_orders_user" SET TABLESPACE "fast";',
      'ALTER INDEX "shop"."idx_orders_user" RENAME TO "idx_orders_by_user";',
    ]);
  });

  test('clearing the tablespace moves the index back to pg_default', () => {
    const withTs = index({ tablespace: 'fast' });
    const result = plan(planIndexChange(withTs, { ...indexDraftFrom(withTs), tablespace: '' }, ctx(t)));
    expect(result.statements).toEqual([
      'ALTER INDEX "shop"."idx_orders_user" SET TABLESPACE pg_default;',
    ]);
  });

  test('structural changes recreate the index in one transaction', () => {
    const result = plan(
      planIndexChange(original, { ...base(), include: ['total'] }, ctx(t))
    );
    expect(result.mode).toBe('recreate');
    expect(planScript(result)).toBe(
      'BEGIN;\n' +
        'DROP INDEX "shop"."idx_orders_user";\n' +
        'CREATE INDEX "idx_orders_user" ON "shop"."orders" USING btree ("user_id") INCLUDE ("total") WITH (fillfactor = 70);\n' +
        'COMMIT;'
    );
    expect(result.warnings[0]).toContain('blocks writes');
  });

  test('a concurrent recreate builds a replacement, then swaps names', () => {
    const result = plan(
      planIndexChange(original, { ...base(), unique: true, concurrently: true }, ctx(t))
    );
    expect(result.transactional).toBe(false);
    expect(result.statements).toEqual([
      'CREATE UNIQUE INDEX CONCURRENTLY "idx_orders_user_new" ON "shop"."orders" USING btree ("user_id") WITH (fillfactor = 70);',
      'DROP INDEX CONCURRENTLY "shop"."idx_orders_user";',
      'ALTER INDEX "shop"."idx_orders_user_new" RENAME TO "idx_orders_user";',
    ]);
    expect(result.warnings.join(' ')).toContain('idx_orders_user_new');
  });

  test('a concurrent recreate under a new name needs no swap', () => {
    const result = plan(
      planIndexChange(original, { ...base(), name: 'by_user', unique: true, concurrently: true }, ctx(t))
    );
    expect(result.statements).toEqual([
      'CREATE UNIQUE INDEX CONCURRENTLY "by_user" ON "shop"."orders" USING btree ("user_id") WITH (fillfactor = 70);',
      'DROP INDEX CONCURRENTLY "shop"."idx_orders_user";',
    ]);
  });

  test('constraint-backed indexes are refused with the constraint named', () => {
    const pkey = index({ name: 'orders_pkey', isPrimary: true, constraint: { name: 'orders_pkey', kind: 'primary' } });
    const result = planIndexChange(pkey, { ...indexDraftFrom(pkey), name: 'x' }, ctx(t));
    expect(result).toEqual({
      ok: false,
      reason:
        'This index enforces the primary key constraint "orders_pkey". Change it with ALTER TABLE … DROP/ADD CONSTRAINT instead.',
    });
  });
});

describe('dropIndex', () => {
  test('drops without CASCADE, optionally concurrently', () => {
    expect(planScript(plan(dropIndex(index(), table(), { concurrently: false })))).toBe(
      'DROP INDEX "shop"."idx_orders_user";'
    );
    const concurrent = plan(dropIndex(index(), table(), { concurrently: true }));
    expect(concurrent.statements).toEqual(['DROP INDEX CONCURRENTLY "shop"."idx_orders_user";']);
    expect(concurrent.transactional).toBe(false);
  });

  test('refuses constraint-backed indexes', () => {
    const result = dropIndex(
      index({ constraint: { name: 'orders_email_key', kind: 'unique' } }),
      table(),
      { concurrently: false }
    );
    expect(result.ok).toBe(false);
  });
});
