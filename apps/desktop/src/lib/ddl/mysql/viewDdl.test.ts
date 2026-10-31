import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { createView, emptyViewDraft, planViewChange, viewDraftFrom } from './viewDdl';

const view = {
  schema: 'shop',
  name: 'active_users',
  viewSql: 'SELECT id FROM users',
} as TableSchema;

describe('mysql view ddl', () => {
  test('creates with OR REPLACE and an optional check option', () => {
    const draft = emptyViewDraft('shop');
    draft.name = 'active_users';
    draft.definition = 'SELECT id FROM users';
    draft.checkOption = true;
    const plan = createView(draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toBe(
      'CREATE OR REPLACE VIEW `shop`.`active_users` AS\nSELECT id FROM users\nWITH CHECK OPTION;',
    );
  });

  test('renames with RENAME TABLE and refuses materialized views', () => {
    const draft = emptyViewDraft('shop');
    draft.name = 'active_people';
    draft.definition = 'SELECT id FROM users';
    const plan = planViewChange(view, draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements.join('\n')).toContain('RENAME TABLE `shop`.`active_users` TO `shop`.`active_people`');
    draft.materialized = true;
    expect(createView(draft).ok).toBe(false);
  });

  test('keeps an invoker security clause and a check option loaded from the catalog', () => {
    const loaded = {
      schema: 'shop',
      name: 'invoker_users',
      viewSql: 'SELECT id FROM users\nWITH CASCADED CHECK OPTION',
      sqlSecurity: 'INVOKER',
    } as TableSchema;
    const draft = viewDraftFrom(loaded);
    expect(draft.checkOption).toBe(true);
    expect(draft.definition).toBe('SELECT id FROM users');
    expect(draft.sqlSecurity).toBe('INVOKER');
    const plan = planViewChange(loaded, draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('SQL SECURITY INVOKER');
    expect(plan.statements[0]).toContain('WITH CHECK OPTION');
    expect(plan.statements[0].match(/CHECK OPTION/g)?.length).toBe(1);
  });
});
