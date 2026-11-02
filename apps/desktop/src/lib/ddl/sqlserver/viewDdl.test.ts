import { describe, expect, test } from 'bun:test';
import { planCreateView } from './viewDdl';

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
});
