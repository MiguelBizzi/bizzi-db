import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { planCreateView, planViewChange } from './viewDdl';

describe('sqlserver view ddl', () => {
  test('emits CREATE OR ALTER VIEW as its own statement', () => {
    const plan = planCreateView(
      {
        schema: 'sales',
        name: 'open_orders',
        materialized: false,
        definition: 'SELECT id FROM orders',
        comment: '',
        withData: true,
        recreate: false,
        checkOption: false,
      },
      true,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements).toEqual([
      'CREATE OR ALTER VIEW [sales].[open_orders]\nAS\nSELECT id FROM orders;',
    ]);
  });

  test('refuses a materialized view', () => {
    const plan = planCreateView(
      {
        schema: 'sales',
        name: 'open_orders',
        materialized: true,
        definition: 'SELECT id FROM orders',
        comment: '',
        withData: true,
        recreate: false,
        checkOption: false,
      },
      true,
    );
    expect(plan.ok).toBe(false);
  });

  test('moves a view to another schema by dropping it and creating it there', () => {
    const view: TableSchema = {
      id: 'dbo.open_orders',
      schema: 'dbo',
      name: 'open_orders',
      rowCount: 0,
      sizeMb: 0,
      tags: [],
      createdAt: '',
      updatedAt: '',
      columns: [],
      indexes: [],
      viewSql: 'SELECT id FROM orders',
    };
    const plan = planViewChange(view, {
      schema: 'sales',
      name: 'open_orders',
      materialized: false,
      definition: 'SELECT id FROM orders',
      comment: '',
      withData: true,
      recreate: false,
      checkOption: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toBe('DROP VIEW [dbo].[open_orders];');
    expect(plan.statements[1]).toContain('CREATE OR ALTER VIEW [sales].[open_orders]');
    expect(plan.statements.join('\n')).not.toContain('sp_rename');
  });
});
