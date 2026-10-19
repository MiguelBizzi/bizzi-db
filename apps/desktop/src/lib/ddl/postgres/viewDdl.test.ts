import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { planScript, type DdlPlan, type DdlResult } from '../types';
import {
  createView,
  dropView,
  emptyViewDraft,
  planViewChange,
  validateView,
  viewDraftFrom,
} from './viewDdl';

function view(overrides: Partial<TableSchema> = {}): TableSchema {
  return {
    id: 'shop.v_paid',
    name: 'v_paid',
    schema: 'shop',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: [],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    isView: true,
    viewSql: ' SELECT orders.id\n   FROM shop.orders\n  WHERE orders.status = \'paid\'::shop.order_status;',
    ...overrides,
  };
}

function plan(result: DdlResult): DdlPlan {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('createView', () => {
  test('creates a view with a comment, trimming the trailing semicolon', () => {
    const sql = planScript(
      plan(
        createView({
          ...emptyViewDraft('shop'),
          name: 'v_open',
          definition: 'SELECT id FROM shop.orders WHERE status = \'pending\';\n',
          comment: "Open orders, it's simple",
        })
      )
    );
    expect(sql).toBe(
      'BEGIN;\nCREATE VIEW "shop"."v_open" AS\nSELECT id FROM shop.orders WHERE status = \'pending\';\n' +
        `COMMENT ON VIEW "shop"."v_open" IS 'Open orders, it''s simple';\nCOMMIT;`
    );
  });

  test('creates a materialized view, optionally without data', () => {
    const result = plan(
      createView({
        ...emptyViewDraft('shop'),
        name: 'mv_x',
        materialized: true,
        withData: false,
        definition: 'SELECT 1 AS n',
      })
    );
    expect(result.statements).toEqual([
      'CREATE MATERIALIZED VIEW "shop"."mv_x" AS\nSELECT 1 AS n\nWITH NO DATA;',
    ]);
  });
});

describe('validateView', () => {
  test('needs a name and a definition', () => {
    expect(validateView({ ...emptyViewDraft('shop'), name: '', definition: ' ' })).toEqual([
      'Name is required.',
      'Definition is required.',
    ]);
  });
});

describe('viewDraftFrom', () => {
  test('reads the definition without the trailing semicolon', () => {
    const draft = viewDraftFrom(view({ description: 'Paid' }));
    expect(draft.definition).toBe(
      "SELECT orders.id\n   FROM shop.orders\n  WHERE orders.status = 'paid'::shop.order_status"
    );
    expect(draft.comment).toBe('Paid');
    expect(draft.materialized).toBe(false);
  });
});

describe('planViewChange', () => {
  test('no change, including whitespace-only edits, runs nothing', () => {
    const draft = viewDraftFrom(view());
    expect(plan(planViewChange(view(), draft)).mode).toBe('none');
    const spaced = { ...draft, definition: `  ${draft.definition.replace(/\n\s+/g, ' ')}  ` };
    expect(plan(planViewChange(view(), spaced)).mode).toBe('none');
  });

  test('a new definition uses CREATE OR REPLACE, then renames and moves', () => {
    const result = plan(
      planViewChange(view(), {
        ...viewDraftFrom(view()),
        definition: 'SELECT id, total FROM shop.orders',
        name: 'v_paid_orders',
        schema: 'billing',
      })
    );
    expect(result.mode).toBe('replace');
    expect(result.statements).toEqual([
      'CREATE OR REPLACE VIEW "shop"."v_paid" AS\nSELECT id, total FROM shop.orders;',
      'ALTER VIEW "shop"."v_paid" RENAME TO "v_paid_orders";',
      'ALTER VIEW "shop"."v_paid_orders" SET SCHEMA "billing";',
    ]);
    expect(result.warnings.join(' ')).toContain('Drop and recreate');
  });

  test('drop and recreate when asked', () => {
    const result = plan(
      planViewChange(view({ description: 'Paid' }), {
        ...viewDraftFrom(view({ description: 'Paid' })),
        definition: 'SELECT id AS order_id FROM shop.orders',
        recreate: true,
      })
    );
    expect(result.mode).toBe('recreate');
    expect(result.statements).toEqual([
      'DROP VIEW "shop"."v_paid";',
      'CREATE VIEW "shop"."v_paid" AS\nSELECT id AS order_id FROM shop.orders;',
      `COMMENT ON VIEW "shop"."v_paid" IS 'Paid';`,
    ]);
  });

  test('materialized views are always rebuilt for a new definition', () => {
    const mv = view({ id: 'shop.mv', name: 'mv', isMaterialized: true, viewSql: ' SELECT 1;' });
    const result = plan(planViewChange(mv, { ...viewDraftFrom(mv), definition: 'SELECT 2' }));
    expect(result.statements).toEqual([
      'DROP MATERIALIZED VIEW "shop"."mv";',
      'CREATE MATERIALIZED VIEW "shop"."mv" AS\nSELECT 2;',
    ]);
    expect(result.warnings.join(' ')).toContain('indexes');
  });

  test('rename and comment alone are ALTER and COMMENT', () => {
    const mv = view({ id: 'shop.mv', name: 'mv', isMaterialized: true, viewSql: ' SELECT 1;' });
    const result = plan(planViewChange(mv, { ...viewDraftFrom(mv), name: 'mv2', comment: 'x' }));
    expect(result.mode).toBe('alter');
    expect(result.statements).toEqual([
      'ALTER MATERIALIZED VIEW "shop"."mv" RENAME TO "mv2";',
      `COMMENT ON MATERIALIZED VIEW "shop"."mv2" IS 'x';`,
    ]);
  });
});

describe('dropView', () => {
  test('drops the right kind without CASCADE', () => {
    expect(plan(dropView(view())).statements).toEqual(['DROP VIEW "shop"."v_paid";']);
    expect(plan(dropView(view({ isMaterialized: true }))).statements).toEqual([
      'DROP MATERIALIZED VIEW "shop"."v_paid";',
    ]);
  });
});
