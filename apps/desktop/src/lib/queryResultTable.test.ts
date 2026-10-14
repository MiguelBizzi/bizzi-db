import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import { analyzeQueryResult } from './queryResultTable';

function table(
  name: string,
  columns: ColumnDefinition[],
  extra: Partial<TableSchema> = {}
): TableSchema {
  return {
    id: `public.${name}`,
    name,
    schema: 'public',
    rowCount: 10,
    sizeMb: 0,
    tags: [],
    columns,
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

const users = table('users', [
  { name: 'id', type: 'integer', isPrimary: true },
  { name: 'email', type: 'text' },
  { name: 'meta', type: 'jsonb' },
]);
const orders = table('orders', [
  { name: 'id', type: 'integer', isPrimary: true },
  { name: 'user_id', type: 'integer' },
]);
const tables = [users, orders];

const analyze = (query: string, columns: string[]) =>
  analyzeQueryResult({ query, columns }, tables);

describe('analyzeQueryResult editability', () => {
  test('plain select of one table with its primary key is editable', () => {
    const result = analyze('SELECT * FROM users LIMIT 50;', ['id', 'email', 'meta']);
    expect(result.editable).toBe(true);
    expect(result.sourceTable?.id).toBe('public.users');
    expect(result.table.id).toBe('public.users');
    expect(result.table.isView).toBeFalsy();
  });

  test('resolves schema-qualified and quoted names', () => {
    const result = analyze('select id, email from "public"."users" where id > 3', ['id', 'email']);
    expect(result.editable).toBe(true);
    expect(result.table.columns.map((c) => c.name)).toEqual(['id', 'email']);
  });

  test('accepts a table alias', () => {
    expect(analyze('SELECT u.id, u.email FROM users u ORDER BY 1', ['id', 'email']).editable).toBe(
      true
    );
    expect(
      analyze('SELECT id FROM users AS u WHERE u.id = 1', ['id']).editable
    ).toBe(true);
  });

  test('ignores keywords inside comments and string literals', () => {
    const sql = "-- join me\nSELECT id, email FROM users WHERE email = 'a join b from c'";
    expect(analyze(sql, ['id', 'email']).editable).toBe(true);
  });

  test('read-only when the primary key column is not selected', () => {
    const result = analyze('SELECT email FROM users', ['email']);
    expect(result.editable).toBe(false);
    expect(result.readOnlyReason).toMatch(/primary key/i);
  });

  test.each([
    ['join', 'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id'],
    ['comma join', 'SELECT users.id FROM users, orders'],
    ['union', 'SELECT id FROM users UNION SELECT id FROM orders'],
    ['group by', 'SELECT id FROM users GROUP BY id'],
    ['distinct', 'SELECT DISTINCT id FROM users'],
    ['cte', 'WITH x AS (SELECT id FROM users) SELECT id FROM x'],
    ['subquery', 'SELECT id FROM (SELECT id FROM users) t'],
    ['window', 'SELECT id, row_number() OVER (ORDER BY id) FROM users'],
    ['aggregate', 'SELECT count(*) FROM users'],
  ])('read-only for %s', (_label, sql) => {
    const result = analyze(sql, ['id']);
    expect(result.editable).toBe(false);
    expect(result.readOnlyReason).toBeTruthy();
  });

  test('read-only for non-select statements', () => {
    expect(analyze('UPDATE users SET email = 1', ['id']).editable).toBe(false);
    expect(analyze('EXPLAIN SELECT id FROM users', ['id']).editable).toBe(false);
  });

  test('read-only when the table is unknown, a view, or has a composite key', () => {
    expect(analyze('SELECT id FROM ghosts', ['id']).editable).toBe(false);

    const view = table('v', [{ name: 'id', type: 'integer', isPrimary: true }], { isView: true });
    expect(analyzeQueryResult({ query: 'SELECT id FROM v', columns: ['id'] }, [view]).editable).toBe(
      false
    );

    const composite = table('m', [
      { name: 'a', type: 'integer', isPrimary: true },
      { name: 'b', type: 'integer', isPrimary: true },
    ]);
    expect(
      analyzeQueryResult({ query: 'SELECT a, b FROM m', columns: ['a', 'b'] }, [composite]).editable
    ).toBe(false);
  });

  test('read-only when the same table name exists in several schemas', () => {
    const a = table('t', [{ name: 'id', type: 'integer', isPrimary: true }], {
      id: 'a.t',
      schema: 'a',
    });
    const b = table('t', [{ name: 'id', type: 'integer', isPrimary: true }], {
      id: 'b.t',
      schema: 'b',
    });
    const ambiguous = analyzeQueryResult({ query: 'SELECT id FROM t', columns: ['id'] }, [a, b]);
    expect(ambiguous.editable).toBe(false);
    const qualified = analyzeQueryResult({ query: 'SELECT id FROM b.t', columns: ['id'] }, [a, b]);
    expect(qualified.editable).toBe(true);
    expect(qualified.table.id).toBe('b.t');
  });

  test('prefers the public schema for unqualified names', () => {
    const other = table('t', [{ name: 'id', type: 'integer', isPrimary: true }], {
      id: 'z.t',
      schema: 'z',
    });
    const pub = table('t', [{ name: 'id', type: 'integer', isPrimary: true }]);
    const result = analyzeQueryResult({ query: 'SELECT id FROM t', columns: ['id'] }, [other, pub]);
    expect(result.table.id).toBe('public.t');
  });

  test('read-only when result columns repeat', () => {
    expect(analyze('SELECT id, id FROM users', ['id', 'id']).editable).toBe(false);
  });
});

describe('analyzeQueryResult grid table', () => {
  test('maps result columns to source columns and marks the rest unknown', () => {
    const result = analyze('SELECT id, upper(email) AS shout FROM users', ['id', 'shout']);
    expect(result.table.columns).toEqual([
      { name: 'id', type: 'integer', isPrimary: true },
      { name: 'shout', type: 'unknown', isNullable: true },
    ]);
    expect(result.readOnlyColumns.has('shout')).toBe(true);
    expect(result.readOnlyColumns.has('id')).toBe(false);
  });

  test('read-only results are presented as a view so cell actions stay disabled', () => {
    const result = analyze('SELECT count(*) AS n FROM users', ['n']);
    expect(result.editable).toBe(false);
    expect(result.table.isView).toBe(true);
    expect(result.table.name).toBe('users');
  });

  test('keeps the source table name for exports even when read-only', () => {
    const result = analyze('SELECT u.id FROM users u JOIN orders o ON true', ['id']);
    expect(result.table.name).toBe('users');
    expect(result.sourceTable).toBeUndefined();
  });

  test('falls back to a generic name when no table can be inferred', () => {
    const result = analyze('SELECT 1 AS one', ['one']);
    expect(result.table.name).toBe('query_result');
    expect(result.editable).toBe(false);
  });

  test('row count reflects the result rows', () => {
    const result = analyzeQueryResult(
      { query: 'SELECT id FROM users', columns: ['id'], rows: [{ id: 1 }, { id: 2 }] },
      tables
    );
    expect(result.table.rowCount).toBe(2);
  });

  test('row count is the whole result when only one page is loaded', () => {
    const result = analyzeQueryResult(
      {
        query: 'SELECT id FROM users',
        columns: ['id'],
        rows: [{ id: 3 }, { id: 4 }],
        pageOffset: 2,
        totalRows: 90,
      },
      tables
    );
    expect(result.table.rowCount).toBe(90);
  });

  test('derives columns from the first row when the result has none', () => {
    const result = analyzeQueryResult(
      { query: 'SELECT id FROM users', rows: [{ id: 1 }] },
      tables
    );
    expect(result.table.columns.map((c) => c.name)).toEqual(['id']);
  });
});
