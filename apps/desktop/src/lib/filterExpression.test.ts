import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, FilterClause } from '../types';
import {
  applyFilterCompletion,
  appendParsedFilters,
  commitFilterExpression,
  filterExpressionCompletions,
  parseFilterExpression,
  serializeFilterExpression,
  shouldSubmitFilterExpression,
  valueHintsFromRows,
} from './filterExpression';

const columns = ['status', 'revenue', 'name', 'role'];

function clause(extras: Partial<FilterClause> & Pick<FilterClause, 'column' | 'operator'>): FilterClause {
  return {
    id: extras.id ?? 'f1',
    value: extras.value ?? '',
    enabled: extras.enabled ?? true,
    ...extras,
  };
}

function col(name: string, extras: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

describe('parseFilterExpression', () => {
  test('parses a single comparison and ANDs additional clauses', () => {
    const one = parseFilterExpression("status = 'active'", columns);
    expect(one).toEqual({
      status: 'ok',
      clauses: [{ column: 'status', operator: '=', value: 'active' }],
    });
    const two = parseFilterExpression("status = 'active' AND revenue > 100", columns);
    expect(two).toEqual({
      status: 'ok',
      clauses: [
        { column: 'status', operator: '=', value: 'active' },
        { column: 'revenue', operator: '>', value: '100' },
      ],
    });
  });

  test('accepts LIKE, ILIKE, <>, IS NULL, IS NOT NULL, and IN lists', () => {
    expect(parseFilterExpression("name LIKE 'a'", columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'name', operator: 'LIKE', value: 'a' }],
    });
    expect(parseFilterExpression("name ILIKE 'ADA'", columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'name', operator: 'ILIKE', value: 'ADA' }],
    });
    expect(parseFilterExpression("status <> 'active'", columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'status', operator: '!=', value: 'active' }],
    });
    expect(parseFilterExpression('role IS NULL', columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'role', operator: 'IS NULL', value: '' }],
    });
    expect(parseFilterExpression('role IS NOT NULL', columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'role', operator: 'IS NOT NULL', value: '' }],
    });
    expect(parseFilterExpression("name IN ('Ada', 'Grace')", columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'name', operator: 'IN', value: 'Ada, Grace' }],
    });
  });

  test('treats empty input and a trailing AND as incomplete', () => {
    expect(parseFilterExpression('', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('   ', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression("status = 'active' AND", columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('status', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('status =', columns)).toEqual({ status: 'incomplete' });
  });

  test('rejects unknown columns and unsupported connectors with actionable errors', () => {
    expect(parseFilterExpression("revenue = 1", ['status'])).toEqual({
      status: 'error',
      message: "Invalid expression: 'revenue' is not a valid column",
    });
    const or = parseFilterExpression("status = 'a' OR revenue > 1", columns);
    expect(or.status).toBe('error');
    if (or.status === 'error') expect(or.message).toContain('OR');
    const between = parseFilterExpression('revenue BETWEEN 1 AND 2', columns);
    expect(between.status).toBe('error');
    if (between.status === 'error') expect(between.message).toContain('BETWEEN');
    const not = parseFilterExpression("NOT status = 'a'", columns);
    expect(not.status).toBe('error');
    if (not.status === 'error') expect(not.message).toContain('NOT');
  });

  test('resolves quoted identifiers and unescapes string quotes', () => {
    expect(parseFilterExpression('"name" = \'O\'\'Hara\'', columns)).toEqual({
      status: 'ok',
      clauses: [{ column: 'name', operator: '=', value: "O'Hara" }],
    });
  });
});

describe('parseFilterExpression without quotes', () => {
  const one = (text: string, cols = columns) => {
    const result = parseFilterExpression(text, cols);
    if (result.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
    return result.clauses;
  };

  test('treats quoted and unquoted values the same', () => {
    const expected = [{ column: 'name', operator: '=', value: 'john' }];
    expect(one("name = 'john'")).toEqual(expected);
    expect(one('name = "john"')).toEqual(expected);
    expect(one('name = john')).toEqual(expected);
  });

  test('takes spaces and symbols in an unquoted value literally', () => {
    expect(one('name = john smith')[0]!.value).toBe('john smith');
    expect(one('name = a@b.com')[0]!.value).toBe('a@b.com');
    expect(one('name = 2024-01-01')[0]!.value).toBe('2024-01-01');
    expect(one('name LIKE %foo%')[0]).toEqual({ column: 'name', operator: 'LIKE', value: '%foo%' });
  });

  test('splits on AND but keeps an AND inside quotes', () => {
    expect(one('name = john smith and revenue > 5')).toEqual([
      { column: 'name', operator: '=', value: 'john smith' },
      { column: 'revenue', operator: '>', value: '5' },
    ]);
    expect(one("name = 'salt AND pepper'")[0]!.value).toBe('salt AND pepper');
  });

  test('keeps a quoted value that contains quote characters or an operator', () => {
    expect(one('name = "a = b"')[0]!.value).toBe('a = b');
    expect(one("name = it's")[0]!.value).toBe("it's");
  });

  test('keeps unquoted keyword-like words as text', () => {
    expect(one('name = in')[0]!.value).toBe('in');
    expect(one('name = null')[0]!.value).toBe('null');
  });

  test('accepts IN lists with or without parentheses and quotes', () => {
    const expected = [{ column: 'name', operator: 'IN', value: 'Ada, Grace Hopper' }];
    expect(one("name IN ('Ada', 'Grace Hopper')")).toEqual(expected);
    expect(one('name IN (Ada, Grace Hopper)')).toEqual(expected);
    expect(one('name IN Ada, Grace Hopper')).toEqual(expected);
  });

  test('matches columns with spaces, with or without quotes', () => {
    const cols = ['first name', 'id'];
    const expected = [{ column: 'first name', operator: '=', value: 'Ada' }];
    expect(one('"first name" = Ada', cols)).toEqual(expected);
    expect(one('first name = Ada', cols)).toEqual(expected);
    expect(one('FIRST NAME = Ada', cols)).toEqual(expected);
  });

  test('prefers the longest matching column name', () => {
    const cols = ['first', 'first name'];
    expect(one('first name = Ada', cols)[0]!.column).toBe('first name');
    expect(one('first = Ada', cols)[0]!.column).toBe('first');
  });

  test('still reports incomplete drafts as incomplete', () => {
    expect(parseFilterExpression('name = ', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('name = john and', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('name IN (', columns)).toEqual({ status: 'incomplete' });
    expect(parseFilterExpression('na', columns)).toEqual({ status: 'incomplete' });
  });

  test('points a bare word without a column at the missing column', () => {
    const result = parseFilterExpression('john', columns);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain("'john'");
  });

  test('serialized filters parse back to the same clauses', () => {
    const filters = [
      clause({ id: 'a', column: 'name', operator: '=', value: "O'Hara and co" }),
      clause({ id: 'b', column: 'name', operator: 'IN', value: 'Ada, Grace Hopper' }),
      clause({ id: 'c', column: 'role', operator: 'IS NOT NULL' }),
    ];
    const parsed = parseFilterExpression(serializeFilterExpression(filters), columns);
    expect(parsed).toEqual({
      status: 'ok',
      clauses: filters.map(({ column, operator, value }) => ({ column, operator, value })),
    });
  });
});

describe('serializeFilterExpression', () => {
  test('joins enabled complete clauses and skips disabled or empty ones', () => {
    expect(
      serializeFilterExpression([
        clause({ id: 'a', column: 'status', operator: '=', value: 'active' }),
        clause({ id: 'b', column: 'revenue', operator: '>', value: '100' }),
        clause({ id: 'c', column: 'name', operator: '=', value: 'Ada', enabled: false }),
        clause({ id: 'd', column: 'role', operator: '=', value: '' }),
      ])
    ).toBe("status = 'active' AND revenue > 100");
  });

  test('round-trips IS NULL and IN lists', () => {
    expect(
      serializeFilterExpression([clause({ column: 'role', operator: 'IS NULL' })])
    ).toBe('role IS NULL');
    expect(
      serializeFilterExpression([clause({ column: 'name', operator: 'IN', value: 'Ada, Grace' })])
    ).toBe("name IN ('Ada', 'Grace')");
  });

  test('quotes columns that are not simple identifiers', () => {
    expect(
      serializeFilterExpression([clause({ column: 'order', operator: '=', value: '1' })])
    ).toBe("\"order\" = '1'");
  });
});

describe('commitFilterExpression', () => {
  test('appends a valid expression after existing rules and keeps disabled ones', () => {
    const existing = [
      clause({ id: 'on', column: 'status', operator: '=', value: 'old' }),
      clause({ id: 'off', column: 'name', operator: '=', value: 'Ada', enabled: false }),
    ];
    const result = commitFilterExpression("status = 'active' AND revenue > 100", existing, columns, {
      nextId: (index) => `n${index}`,
    });
    expect(result.kind).toBe('commit');
    if (result.kind !== 'commit') return;
    expect(result.filters).toEqual([
      { id: 'on', column: 'status', operator: '=', value: 'old', enabled: true },
      { id: 'off', column: 'name', operator: '=', value: 'Ada', enabled: false },
      { id: 'n0', column: 'status', operator: '=', value: 'active', enabled: true },
      { id: 'n1', column: 'revenue', operator: '>', value: '100', enabled: true },
    ]);
  });

  test('does not apply incomplete drafts', () => {
    const existing = [clause({ id: 'on', column: 'status', operator: '=', value: 'active' })];
    expect(commitFilterExpression("status = 'active' AND", existing, columns)).toEqual({
      kind: 'incomplete',
    });
    expect(commitFilterExpression('', existing, columns)).toEqual({ kind: 'incomplete' });
  });

  test('leaves filters unchanged when the expression is invalid', () => {
    const existing = [clause({ id: 'on', column: 'status', operator: '=', value: 'active' })];
    const result = commitFilterExpression('nope = 1', existing, columns);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toBe("Invalid expression: 'nope' is not a valid column");
    }
  });
});

describe('appendParsedFilters', () => {
  test('appends new clauses and drops empty placeholder rows', () => {
    const appended = appendParsedFilters(
      [{ column: 'status', operator: '=', value: 'x' }],
      [
        clause({ id: 'blank', column: 'name', operator: '=', value: '' }),
        clause({ id: 'keep', column: 'role', operator: '=', value: 'admin' }),
      ],
      (index) => `n${index}`
    );
    expect(appended.map((filter) => filter.id)).toEqual(['keep', 'n0']);
    expect(appended[1]).toEqual({
      id: 'n0',
      column: 'status',
      operator: '=',
      value: 'x',
      enabled: true,
    });
  });
});

describe('shouldSubmitFilterExpression', () => {
  test('submits only a complete expression when the caret is at the end', () => {
    const text = "status = 'active'";
    expect(shouldSubmitFilterExpression(text, text.length, columns)).toBe(true);
    expect(shouldSubmitFilterExpression(text, 3, columns)).toBe(false);
    expect(shouldSubmitFilterExpression("status = 'active' AND", 21, columns)).toBe(false);
    expect(shouldSubmitFilterExpression('nope = 1', 8, columns)).toBe(false);
  });
});

describe('filterExpressionCompletions', () => {
  const defs = [col('status', { enumValues: ['active', 'paused'] }), col('revenue'), col('name')];

  test('suggests columns at the start and after AND', () => {
    expect(
      filterExpressionCompletions('', 0, defs).map((item) => item.label)
    ).toEqual(['status', 'revenue', 'name']);
    const text = "status = 'active' AND ";
    expect(
      filterExpressionCompletions(text, text.length, defs).map((item) => item.label)
    ).toEqual(['status', 'revenue', 'name']);
  });

  test('suggests operators after a column and NULL after IS', () => {
    const afterCol = filterExpressionCompletions('status ', 7, defs);
    expect(afterCol.map((item) => item.label)).toContain('=');
    expect(afterCol.map((item) => item.label)).toContain('IS NULL');
    const afterIs = filterExpressionCompletions('status IS', 9, defs).map((item) => item.label);
    expect(afterIs).toEqual(['NULL', 'NOT NULL']);
  });

  test('suggests enum and row values after an operator, and nothing after a complete clause', () => {
    const values = filterExpressionCompletions('status = ', 9, defs, {
      status: ['active', 'paused'],
    }).filter((item) => item.type === 'value');
    expect(values.map((item) => item.label)).toEqual(['active', 'paused']);
    const text = "status = 'active'";
    expect(filterExpressionCompletions(text, text.length, defs)).toEqual([]);
  });

  test('keeps suggesting after a value with symbols the tokenizer does not know', () => {
    const text = 'name = a@b.com AND ';
    expect(
      filterExpressionCompletions(text, text.length, defs).map((item) => item.label)
    ).toEqual(['status', 'revenue', 'name']);
  });

  test('filters suggestions by the token under the cursor', () => {
    expect(filterExpressionCompletions('rev', 3, defs).map((item) => item.label)).toEqual(['revenue']);
  });
});

describe('applyFilterCompletion', () => {
  test('replaces the token under the cursor and leaves the caret after the insert', () => {
    const items = filterExpressionCompletions('rev', 3, [col('revenue')]);
    expect(applyFilterCompletion('rev', 3, items[0]!)).toEqual({
      text: 'revenue ',
      cursor: 8,
    });
  });
});

describe('valueHintsFromRows', () => {
  test('prefers enum values then distinct loaded-row values, capped', () => {
    const hints = valueHintsFromRows(
      [
        col('role', { enumValues: ['admin', 'staff'] }),
        col('name'),
      ],
      [
        { role: 'admin', name: 'Ada' },
        { role: 'staff', name: 'Alan' },
        { role: 'admin', name: 'Ada' },
      ],
      20
    );
    expect(hints.role).toEqual(['admin', 'staff']);
    expect(hints.name).toEqual(['Ada', 'Alan']);
  });
});
