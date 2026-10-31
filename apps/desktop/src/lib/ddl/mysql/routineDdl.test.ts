import { describe, expect, test } from 'bun:test';
import type { RoutineDefinition } from '../../../types';
import {
  createRoutine,
  emptyRoutineDraft,
  planRoutineChange,
  routineDraftFrom,
  validateRoutine,
} from './routineDdl';

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

  test('an edit creates a temporary routine before dropping the original', () => {
    const draft = emptyRoutineDraft('shop', 'procedure');
    draft.name = 'touch_user';
    draft.body = 'BEGIN\n  SELECT 1;\nEND';
    draft.parameters = [{ mode: 'in', name: 'uid', dataType: 'BIGINT', default: '' }];
    const original = { schema: 'shop', name: 'touch_user', kind: 'procedure' } as RoutineDefinition;
    const plan = planRoutineChange(original, '', draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const sql = plan.statements[0];
    const probe = sql.indexOf('CREATE PROCEDURE `shop`.`touch_user__bnew`');
    const drop = sql.indexOf('DROP PROCEDURE IF EXISTS `shop`.`touch_user`$$');
    const create = sql.indexOf('CREATE PROCEDURE `shop`.`touch_user` (');
    expect(probe).toBeGreaterThanOrEqual(0);
    expect(probe).toBeLessThan(drop);
    expect(drop).toBeLessThan(create);
    expect(sql).toContain('DROP PROCEDURE IF EXISTS `shop`.`touch_user__bnew`');
    expect(plan.warnings[0]).toContain('temporary name');
  });

  test('a non-deterministic function that contains SQL warns about errno 1418', () => {
    const draft = emptyRoutineDraft('shop', 'function');
    expect(draft.dataAccess).toBe('READS SQL DATA');
    draft.name = 'touch';
    draft.body = 'RETURN 1';
    draft.dataAccess = 'CONTAINS SQL';
    const plan = createRoutine(draft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.warnings.join(' ')).toContain('1418');
  });

  test('an edit keeps the catalog data-access characteristic', () => {
    const original = {
      schema: 'shop',
      name: 'user_label',
      kind: 'function',
      volatility: 'immutable',
      dataAccess: 'READS SQL DATA',
      securityDefiner: false,
      parameters: [],
    } as unknown as RoutineDefinition;
    const draft = routineDraftFrom(original, 'RETURN 1');
    expect(draft.dataAccess).toBe('READS SQL DATA');
    expect(draft.volatility).toBe('immutable');
  });
});
