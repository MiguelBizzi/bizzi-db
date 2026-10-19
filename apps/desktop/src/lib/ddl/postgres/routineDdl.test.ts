import { describe, expect, test } from 'bun:test';
import type { RoutineDefinition } from '../../../types';
import { planScript, type DdlPlan, type DdlResult, type RoutineDraft } from '../types';
import {
  createRoutine,
  dollarQuote,
  dropRoutine,
  emptyRoutineDraft,
  planRoutineChange,
  routineDraftFrom,
  validateRoutine,
} from './routineDdl';

function routine(overrides: Partial<RoutineDefinition> = {}): RoutineDefinition {
  return {
    id: 'shop.order_total(p_subtotal numeric, p_tax numeric)',
    oid: '1',
    schema: 'shop',
    name: 'order_total',
    kind: 'function',
    identityArguments: 'p_subtotal numeric, p_tax numeric',
    parameters: [
      { name: 'p_subtotal', dataType: 'numeric', mode: 'in' },
      { name: 'p_tax', dataType: 'numeric', mode: 'in', default: '0' },
    ],
    returnType: 'numeric',
    returnsSet: false,
    language: 'sql',
    volatility: 'immutable',
    isStrict: false,
    securityDefiner: false,
    parallel: 'safe',
    leakproof: false,
    cost: 100,
    hasSqlBody: false,
    ...overrides,
  };
}

const BODY = '\n  SELECT p_subtotal + p_tax\n';

function plan(result: DdlResult): DdlPlan {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function draft(overrides: Partial<RoutineDraft> = {}): RoutineDraft {
  return { ...routineDraftFrom(routine(), BODY), ...overrides };
}

describe('dollarQuote', () => {
  test('uses $function$ unless the body contains it', () => {
    expect(dollarQuote('SELECT 1', 'function')).toBe('$function$SELECT 1$function$');
    expect(dollarQuote('x $function$ y', 'function')).toBe('$fn_1$x $function$ y$fn_1$');
    expect(dollarQuote('$function$ $fn_1$', 'function')).toBe('$fn_2$$function$ $fn_1$$fn_2$');
  });
});

describe('createRoutine', () => {
  test('writes a function with every non-default attribute', () => {
    const sql = planScript(
      plan(
        createRoutine(
          draft({
            strict: true,
            securityDefiner: true,
            leakproof: true,
            cost: '5',
            comment: "Grand total, it's simple.",
          })
        )
      )
    );
    expect(sql).toBe(
      'BEGIN;\n' +
        'CREATE FUNCTION "shop"."order_total"("p_subtotal" numeric, "p_tax" numeric DEFAULT 0)\n' +
        'RETURNS numeric\n' +
        'LANGUAGE sql\n' +
        'IMMUTABLE\n' +
        'STRICT\n' +
        'SECURITY DEFINER\n' +
        'LEAKPROOF\n' +
        'PARALLEL SAFE\n' +
        'COST 5\n' +
        'AS $function$\n  SELECT p_subtotal + p_tax\n$function$;\n' +
        `COMMENT ON FUNCTION "shop"."order_total"(numeric, numeric) IS 'Grand total, it''s simple.';\n` +
        'COMMIT;'
    );
  });

  test('writes RETURNS TABLE, SETOF, OUT modes and ROWS', () => {
    const table = plan(
      createRoutine(
        draft({
          parameters: [{ mode: 'in', name: 'p_status', dataType: 'text', default: '' }],
          returns: {
            kind: 'table',
            columns: [
              { name: 'order_id', dataType: 'bigint' },
              { name: 'total', dataType: 'numeric' },
            ],
          },
          volatility: 'stable',
          parallel: 'unsafe',
          rows: '50',
        })
      )
    );
    expect(table.statements[0]).toContain(
      '"order_total"("p_status" text)\nRETURNS TABLE ("order_id" bigint, "total" numeric)\nLANGUAGE sql\nSTABLE\nROWS 50\n'
    );

    const setof = plan(
      createRoutine(
        draft({
          parameters: [
            { mode: 'inout', name: 'a', dataType: 'int', default: '' },
            { mode: 'out', name: 'b', dataType: 'int', default: '' },
            { mode: 'variadic', name: 'rest', dataType: 'int[]', default: '' },
          ],
          returns: { kind: 'type', type: 'record', setOf: true },
          parallel: 'unsafe',
        })
      )
    );
    expect(setof.statements[0]).toContain(
      '(INOUT "a" int, OUT "b" int, VARIADIC "rest" int[])\nRETURNS SETOF record\n'
    );
  });

  test('procedures take no RETURNS or function-only attributes', () => {
    const sql = planScript(
      plan(
        createRoutine({
          ...emptyRoutineDraft('ops', 'procedure'),
          name: 'purge',
          parameters: [{ mode: 'in', name: 'p_age', dataType: 'interval', default: "'90 days'" }],
          body: 'BEGIN\n  NULL;\nEND;',
          volatility: 'immutable',
          strict: true,
        })
      )
    );
    expect(sql).toBe(
      'CREATE PROCEDURE "ops"."purge"("p_age" interval DEFAULT \'90 days\')\n' +
        'LANGUAGE plpgsql\n' +
        'AS $procedure$BEGIN\n  NULL;\nEND;$procedure$;'
    );
  });

  test('empty draft defaults to a plpgsql function returning void', () => {
    const d = emptyRoutineDraft('public', 'function');
    expect(d.language).toBe('plpgsql');
    expect(d.returns).toEqual({ kind: 'type', type: 'void', setOf: false });
    expect(d.body).toContain('BEGIN');
  });
});

describe('validateRoutine', () => {
  test('requires name, body, types and a return type', () => {
    const errors = validateRoutine(
      draft({
        name: '',
        body: '  ',
        parameters: [{ mode: 'in', name: 'a', dataType: '', default: '' }],
        returns: { kind: 'type', type: '', setOf: false },
      })
    );
    expect(errors).toEqual([
      'Name is required.',
      'Every parameter needs a type.',
      'Return type is required.',
      'Body is required.',
    ]);
  });

  test('enforces PostgreSQL parameter rules', () => {
    expect(
      validateRoutine(
        draft({
          parameters: [
            { mode: 'in', name: 'a', dataType: 'int', default: '1' },
            { mode: 'in', name: 'b', dataType: 'int', default: '' },
          ],
        })
      )
    ).toContain('Parameters after one with a default must also have defaults.');
    expect(
      validateRoutine(
        draft({
          parameters: [
            { mode: 'in', name: 'a', dataType: 'int', default: '' },
            { mode: 'in', name: 'a', dataType: 'int', default: '' },
          ],
        })
      )
    ).toContain('Parameter "a" is declared twice.');
    expect(
      validateRoutine(
        draft({
          parameters: [
            { mode: 'variadic', name: 'a', dataType: 'int[]', default: '' },
            { mode: 'in', name: 'b', dataType: 'int', default: '' },
          ],
        })
      )
    ).toContain('A VARIADIC parameter must be the last input parameter.');
    expect(
      validateRoutine(
        draft({ parameters: [{ mode: 'out', name: 'a', dataType: 'int', default: '1' }] })
      )
    ).toContain('OUT parameters cannot have defaults.');
  });
});

describe('routineDraftFrom', () => {
  test('splits RETURNS TABLE columns out of the parameters', () => {
    const d = routineDraftFrom(
      routine({
        parameters: [
          { name: 'p_status', dataType: 'text', mode: 'in' },
          { name: 'order_id', dataType: 'bigint', mode: 'table' },
        ],
        returnType: 'TABLE(order_id bigint)',
        returnsSet: true,
      }),
      BODY
    );
    expect(d.parameters.map((p) => p.name)).toEqual(['p_status']);
    expect(d.returns).toEqual({ kind: 'table', columns: [{ name: 'order_id', dataType: 'bigint' }] });
  });

  test('reads SETOF from the result type', () => {
    const d = routineDraftFrom(routine({ returnType: 'SETOF shop.orders', returnsSet: true }), BODY);
    expect(d.returns).toEqual({ kind: 'type', type: 'shop.orders', setOf: true });
  });
});

describe('planRoutineChange', () => {
  test('nothing changed runs nothing', () => {
    expect(plan(planRoutineChange(routine(), BODY, draft())).mode).toBe('none');
  });

  test('body and attribute changes use CREATE OR REPLACE', () => {
    const result = plan(
      planRoutineChange(routine(), BODY, draft({ body: 'SELECT 1', volatility: 'stable' }))
    );
    expect(result.mode).toBe('replace');
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]).toStartWith(
      'CREATE OR REPLACE FUNCTION "shop"."order_total"("p_subtotal" numeric, "p_tax" numeric DEFAULT 0)'
    );
    expect(result.statements[0]).toContain('\nSTABLE\n');
  });

  test('rename, move and comment are ALTER/COMMENT statements', () => {
    const result = plan(
      planRoutineChange(
        routine(),
        BODY,
        draft({ name: 'grand_total', schema: 'billing', comment: 'Total.' })
      )
    );
    expect(result.mode).toBe('alter');
    expect(result.transactional).toBe(true);
    expect(result.statements).toEqual([
      'ALTER FUNCTION "shop"."order_total"(p_subtotal numeric, p_tax numeric) RENAME TO "grand_total";',
      'ALTER FUNCTION "shop"."grand_total"(p_subtotal numeric, p_tax numeric) SET SCHEMA "billing";',
      `COMMENT ON FUNCTION "billing"."grand_total"(numeric, numeric) IS 'Total.';`,
    ]);
  });

  test('clearing a comment sets it to NULL', () => {
    const result = plan(
      planRoutineChange(routine({ comment: 'Old' }), BODY, draft({ comment: '' }))
    );
    expect(result.statements).toEqual([
      'COMMENT ON FUNCTION "shop"."order_total"(numeric, numeric) IS NULL;',
    ]);
  });

  test.each([
    ['argument type', { parameters: [{ mode: 'in', name: 'p_subtotal', dataType: 'integer', default: '' }, { mode: 'in', name: 'p_tax', dataType: 'numeric', default: '0' }] }],
    ['input parameter name', { parameters: [{ mode: 'in', name: 'subtotal', dataType: 'numeric', default: '' }, { mode: 'in', name: 'p_tax', dataType: 'numeric', default: '0' }] }],
    ['removed default', { parameters: [{ mode: 'in', name: 'p_subtotal', dataType: 'numeric', default: '' }, { mode: 'in', name: 'p_tax', dataType: 'numeric', default: '' }] }],
    ['return type', { returns: { kind: 'type', type: 'integer', setOf: false } }],
    ['kind', { kind: 'procedure' }],
  ] as [string, Partial<RoutineDraft>][])('a changed %s drops and recreates', (_label, change) => {
    const result = plan(
      planRoutineChange(routine({ comment: 'Kept' }), BODY, draft({ comment: 'Kept', ...change }))
    );
    expect(result.mode).toBe('recreate');
    expect(result.transactional).toBe(true);
    expect(result.statements[0]).toBe(
      'DROP FUNCTION "shop"."order_total"(p_subtotal numeric, p_tax numeric);'
    );
    expect(result.statements[1]).toMatch(/^CREATE (FUNCTION|PROCEDURE) /);
    expect(result.statements.at(-1)).toContain("IS 'Kept';");
    expect(result.warnings.join(' ')).toContain('depend');
  });

  test('type spelling differences are not signature changes', () => {
    const result = plan(
      planRoutineChange(
        routine({ parameters: [{ name: 'a', dataType: 'character varying', mode: 'in' }], identityArguments: 'a character varying' }),
        BODY,
        { ...routineDraftFrom(routine({ parameters: [{ name: 'a', dataType: 'character varying', mode: 'in' }] }), BODY), parameters: [{ mode: 'in', name: 'a', dataType: 'varchar', default: '' }], body: 'SELECT 2' }
      )
    );
    expect(result.mode).toBe('replace');
  });

  test('adding a default is allowed in place', () => {
    const changed = draft({
      parameters: [
        { mode: 'in', name: 'p_subtotal', dataType: 'numeric', default: '0' },
        { mode: 'in', name: 'p_tax', dataType: 'numeric', default: '0' },
      ],
    });
    expect(plan(planRoutineChange(routine(), BODY, changed)).mode).toBe('replace');
  });

  test('SQL-standard bodies cannot be form-edited', () => {
    const result = planRoutineChange(routine({ hasSqlBody: true }), '', draft());
    expect(result.ok).toBe(false);
  });
});

describe('dropRoutine', () => {
  test('drops by identity arguments without CASCADE', () => {
    expect(plan(dropRoutine(routine())).statements).toEqual([
      'DROP FUNCTION "shop"."order_total"(p_subtotal numeric, p_tax numeric);',
    ]);
    expect(
      plan(dropRoutine(routine({ kind: 'procedure', identityArguments: 'IN p interval' }))).statements
    ).toEqual(['DROP PROCEDURE "shop"."order_total"(IN p interval);']);
  });
});
