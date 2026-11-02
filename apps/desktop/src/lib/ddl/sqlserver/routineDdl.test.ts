import { describe, expect, test } from 'bun:test';
import { planCreateRoutine } from './routineDdl';
import type { RoutineDraft } from '../types';

function draft(overrides: Partial<RoutineDraft> = {}): RoutineDraft {
  return {
    schema: 'dbo',
    name: 'touch',
    kind: 'procedure',
    parameters: [{ name: 'id', dataType: 'int', mode: 'out', default: '' }],
    returns: { kind: 'type', type: 'int', setOf: false },
    language: 'T-SQL',
    body: 'SET @id = 1',
    volatility: 'volatile',
    strict: false,
    securityDefiner: true,
    parallel: '',
    leakproof: false,
    cost: '',
    rows: '',
    comment: '',
    ...overrides,
  };
}

describe('sqlserver routine ddl', () => {
  test('emits CREATE OR ALTER PROCEDURE with OUTPUT and EXECUTE AS', () => {
    const plan = planCreateRoutine(draft(), true);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('CREATE OR ALTER PROCEDURE [dbo].[touch]');
    expect(plan.statements[0]).toContain('@id int OUTPUT');
    expect(plan.statements[0]).toContain('WITH EXECUTE AS OWNER');
    expect(plan.statements[0]).toContain('AS\nBEGIN\nSET @id = 1\nEND');
  });

  test('emits a scalar function', () => {
    const plan = planCreateRoutine(
      draft({
        kind: 'function',
        name: 'twice',
        parameters: [{ name: 'n', dataType: 'int', mode: 'in', default: '' }],
        body: 'RETURN @n * 2',
        securityDefiner: false,
      }),
      true,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('CREATE OR ALTER FUNCTION [dbo].[twice](@n int)');
    expect(plan.statements[0]).toContain('RETURNS int');
  });
});
