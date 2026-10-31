import { describe, expect, test } from 'bun:test';
import type { RoutineDefinition } from '../../../types';
import { createRoutine, emptyRoutineDraft, planRoutineChange, validateRoutine } from './routineDdl';

describe('mysql routine ddl', () => {
  test('wraps a function in DELIMITER and rejects OUT parameters', () => {
    const draft = emptyRoutineDraft('shop', 'function');
    draft.name = 'role_rank';
    draft.returns = { kind: 'type', type: 'INT', setOf: false };
    draft.volatility = 'immutable';
    draft.dataAccess = 'NO SQL';
    draft.body = 'RETURN 1';
    draft.parameters = [{ mode: 'in', name: 'role_name', dataType: 'VARCHAR(32)', default: '' }];
    const plan = createRoutine(draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('DELIMITER $$');
    expect(plan.statements[0]).toContain('CREATE FUNCTION `shop`.`role_rank`');
    expect(plan.statements[0]).toContain('DETERMINISTIC');
    expect(plan.statements[0]).toContain('NO SQL');
    expect(plan.transactional).toBe(false);

    draft.parameters[0].mode = 'out';
    expect(validateRoutine(draft).join(' ')).toContain('IN only');
  });

  test('an edit is DROP then CREATE and says it is not atomic', () => {
    const draft = emptyRoutineDraft('shop', 'procedure');
    draft.name = 'touch_user';
    draft.body = 'BEGIN\n  SELECT 1;\nEND';
    draft.parameters = [{ mode: 'in', name: 'uid', dataType: 'BIGINT', default: '' }];
    const original = { schema: 'shop', name: 'touch_user', kind: 'procedure' } as RoutineDefinition;
    const plan = planRoutineChange(original, '', draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toContain('DROP PROCEDURE IF EXISTS `shop`.`touch_user`');
    expect(plan.statements[0]).toContain('CREATE PROCEDURE `shop`.`touch_user`');
    expect(plan.warnings[0]).toContain('not one atomic');
  });
});
