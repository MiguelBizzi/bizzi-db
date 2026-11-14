import { describe, expect, test } from 'bun:test';
import type { RoutineDefinition } from '../../../types';
import { planCreateRoutine, planRoutineChange, routineDraftFrom } from './routineDdl';
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

  test('emits OUTPUT for an inout parameter', () => {
    const plan = planCreateRoutine(
      draft({ parameters: [{ name: 'id', dataType: 'int', mode: 'inout', default: '' }] }),
      true,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('@id int OUTPUT');
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

  test('an untouched routine stages nothing', () => {
    const original = {
      schema: 'dbo',
      name: 'twice',
      kind: 'function',
      parameters: [{ mode: 'in', name: '@n', dataType: 'int' }],
      returnType: 'int',
      returnsSet: false,
      securityDefiner: false,
    } as unknown as RoutineDefinition;
    const body = 'RETURN @n * 2';
    const unchanged = routineDraftFrom(original, body);
    const plan = planRoutineChange(original, body, unchanged);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.mode).toBe('none');
    expect(plan.statements).toEqual([]);
    const edited = planRoutineChange(original, body, { ...unchanged, body: 'RETURN @n * 3' });
    expect(edited.ok && edited.statements.length).toBe(1);
  });
});
