import { describe, expect, test } from 'bun:test';
import { sqlCompletions, type SqlSchemaTable } from './sqlComplete';

const tables: SqlSchemaTable[] = [
  {
    schema: 'shop',
    name: 'users',
    columns: [{ name: 'id' }, { name: 'email' }],
  },
  {
    schema: 'shop',
    name: 'orders',
    columns: [{ name: 'id' }, { name: 'user_id' }],
  },
];

const shopTables: SqlSchemaTable[] = [
  ...tables,
  {
    schema: 'shop',
    name: 'order_items',
    columns: [{ name: 'order_id' }, { name: 'sku' }],
  },
];

function at(source: string, schema: SqlSchemaTable[] = shopTables) {
  const cursor = source.indexOf('|');
  const sql = source.replace('|', '');
  return sqlCompletions(sql, cursor, schema);
}

const labels = (items: { label: string }[]) => items.map((item) => item.label);
const ofType = (items: { type: string; label: string }[], type: string) =>
  labels(items.filter((item) => item.type === type));

describe('sqlCompletions · context awareness', () => {
  test('does not suggest tables again once a table follows FROM', () => {
    const items = at('SELECT * FROM shop.users |');
    expect(ofType(items, 'table')).toEqual([]);
    expect(ofType(items, 'schema')).toEqual([]);
    expect(labels(items)).toContain('WHERE');
    expect(labels(items)).toContain('JOIN');
  });

  test('does not offer the whole keyword list after a table', () => {
    const items = at('SELECT * FROM shop.users |');
    expect(labels(items)).not.toContain('SELECT');
    expect(labels(items)).not.toContain('INSERT');
    expect(items.length).toBeLessThan(15);
  });

  test('stays quiet when the typed table name is already complete', () => {
    expect(at('SELECT * FROM shop.users|')).toEqual([]);
  });

  test('keeps suggesting other tables sharing the typed prefix', () => {
    expect(ofType(at('SELECT * FROM shop.order|'), 'table')).toEqual([
      'shop.orders',
      'shop.order_items',
    ]);
  });

  test('suggests tables again after a comma in FROM', () => {
    expect(ofType(at('SELECT * FROM shop.users u, |'), 'table')).toContain('shop.orders');
  });

  test('suggests only ON or USING after JOIN <table>', () => {
    const items = at('SELECT * FROM shop.users u JOIN shop.orders o |');
    expect(labels(items)).toEqual(['ON', 'USING']);
  });

  test('suggests tables after JOIN modifiers are completed', () => {
    expect(ofType(at('SELECT * FROM shop.users u LEFT JOIN |'), 'table')).toContain(
      'shop.orders'
    );
  });

  test('suggests JOIN after LEFT', () => {
    expect(labels(at('SELECT * FROM shop.users u LEFT |'))).toContain('JOIN');
  });

  test('does not suggest an alias slot after AS', () => {
    expect(at('SELECT * FROM shop.users AS |')).toEqual([]);
  });
});

describe('sqlCompletions · aliases and scope', () => {
  test('resolves an alias to its table columns', () => {
    const items = at('SELECT * FROM shop.users u WHERE u.|');
    expect(labels(items).sort()).toEqual(['email', 'id']);
  });

  test('filters alias columns by prefix and keeps the qualifier when applying', () => {
    const items = at('SELECT * FROM shop.users u WHERE u.em|');
    expect(labels(items)).toEqual(['email']);
    expect(items[0]?.apply).toBe('u."email"');
  });

  test('resolves AS aliases and several joined tables', () => {
    const sql = 'SELECT * FROM shop.users AS u JOIN shop.orders o ON o.|';
    expect(labels(at(sql)).sort()).toEqual(['id', 'user_id']);
  });

  test('scopes unqualified columns to the tables in the query', () => {
    const items = at('SELECT | FROM shop.order_items');
    expect(ofType(items, 'column').sort()).toEqual(['order_id', 'sku']);
  });

  test('qualifies ambiguous columns when several tables are in scope', () => {
    const items = at('SELECT | FROM shop.users u JOIN shop.orders o ON true');
    const cols = ofType(items, 'column');
    expect(cols).toContain('email');
    expect(cols).toContain('u.id');
    expect(cols).toContain('o.id');
    expect(cols).not.toContain('id');
    expect(items.find((item) => item.label === 'o.id')?.apply).toBe('o."id"');
  });

  test('only sees tables of the current statement', () => {
    const items = at('SELECT 1 FROM shop.users; SELECT | FROM shop.order_items');
    expect(ofType(items, 'column').sort()).toEqual(['order_id', 'sku']);
  });

  test('ignores table names inside strings and comments', () => {
    const sql = "SELECT 'FROM shop.users' /* FROM shop.users */ FROM shop.orders WHERE |";
    expect(ofType(at(sql), 'column').sort()).toEqual(['id', 'user_id']);
  });

  test('uses the subquery tables inside parentheses', () => {
    const sql = 'SELECT * FROM shop.users WHERE id IN (SELECT | FROM shop.orders)';
    expect(ofType(at(sql), 'column').sort()).toEqual(['id', 'user_id']);
  });

  test('lists the target table columns inside INSERT column lists', () => {
    const items = at('INSERT INTO shop.users (|');
    expect(labels(items).sort()).toEqual(['email', 'id']);
  });

  test('completes UPDATE ... SET columns for the target table', () => {
    const items = at('UPDATE shop.users SET |');
    expect(ofType(items, 'column').sort()).toEqual(['email', 'id']);
  });
});

describe('sqlCompletions · position in the query', () => {
  test('after a column in WHERE offers operators and connectors, not columns', () => {
    const items = at('SELECT * FROM shop.users WHERE id |');
    expect(ofType(items, 'column')).toEqual([]);
    expect(labels(items)).toEqual(expect.arrayContaining(['=', 'AND', 'OR', 'IN', 'IS', 'LIKE']));
    expect(labels(items)).toContain('ORDER BY');
  });

  test('after an operator suggests columns again', () => {
    expect(ofType(at('SELECT * FROM shop.orders WHERE id = |'), 'column')).toContain(
      'user_id'
    );
  });

  test('after AND suggests columns', () => {
    expect(
      ofType(at('SELECT * FROM shop.users WHERE id = 1 AND |'), 'column').sort()
    ).toEqual(['email', 'id']);
  });

  test('after SELECT <column> suggests FROM and AS', () => {
    expect(labels(at('SELECT id |'))).toEqual(['FROM', 'AS']);
  });

  test('does not repeat FROM when the statement already has one', () => {
    expect(labels(at('SELECT id | FROM shop.users'))).toEqual(['AS']);
  });

  test('after ORDER BY <column> offers sort directions', () => {
    const items = at('SELECT id FROM shop.users ORDER BY id |');
    expect(labels(items)).toEqual(expect.arrayContaining(['ASC', 'DESC', 'LIMIT']));
    expect(ofType(items, 'column')).toEqual([]);
  });

  test('after GROUP suggests BY', () => {
    expect(labels(at('SELECT id FROM shop.users GROUP |'))).toEqual(['BY']);
  });

  test('after IS suggests NULL and NOT', () => {
    expect(labels(at('SELECT * FROM shop.users WHERE email IS |'))).toEqual(
      expect.arrayContaining(['NULL', 'NOT'])
    );
  });

  test('at the start of a statement suggests statement starters', () => {
    const items = at('|');
    expect(labels(items)).toEqual(expect.arrayContaining(['SELECT', 'INSERT INTO', 'UPDATE']));
    expect(labels(items)).not.toContain('WHERE');
  });

  test('suggests starters again after a semicolon', () => {
    expect(labels(at('SELECT 1; |'))).toContain('SELECT');
  });

  test('stays quiet inside string literals and comments', () => {
    expect(at("SELECT * FROM shop.users WHERE email = 'ab|")).toEqual([]);
    expect(at('SELECT 1 -- fro|')).toEqual([]);
    expect(at('SELECT 1 /* wh| */')).toEqual([]);
  });
});

describe('sqlCompletions · ranking and casing', () => {
  test('puts prefix matches before word-boundary matches', () => {
    const items = at('SELECT i| FROM shop.orders');
    expect(ofType(items, 'column')).toEqual(['id', 'user_id']);
  });

  test('matches keyword casing to what the user is typing', () => {
    expect(labels(at('sel|'))).toContain('select');
    expect(labels(at('SEL|'))).toContain('SELECT');
  });

  test('follows the casing of keywords already in the query', () => {
    expect(labels(at('select * from shop.users |'))).toContain('where');
  });

  test('does not suggest an item that is exactly what was typed', () => {
    expect(labels(at('SELECT * FROM shop.users WHERE id|'))).not.toContain('id');
  });
});

describe('sqlCompletions', () => {
  test('suggests tables after FROM', () => {
    const sql = 'SELECT * FROM ';
    const items = sqlCompletions(sql, sql.length, tables);
    const labels = items.map((item) => item.label);
    expect(labels).toContain('shop.users');
    expect(labels).toContain('shop.orders');
    expect(items.find((item) => item.label === 'shop.users')?.apply).toBe(
      '"shop"."users"'
    );
  });

  test('suggests tables after JOIN and filters by prefix', () => {
    const sql = 'SELECT * FROM shop.users JOIN us';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items.map((item) => item.label)).toEqual(['shop.users']);
  });

  test('suggests columns after SELECT when FROM is known', () => {
    const sql = 'SELECT  FROM shop.users';
    const items = sqlCompletions(sql, 7, tables).filter((item) => item.type === 'column');
    expect(items.map((item) => item.label).sort()).toEqual(['email', 'id']);
    expect(items.every((item) => item.apply.startsWith('"'))).toBe(true);
  });

  test('suggests columns after WHERE', () => {
    const sql = 'SELECT id FROM shop.users WHERE em';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items.map((item) => item.label)).toEqual(['email']);
  });

  test('falls back to all columns when no FROM table is known', () => {
    const sql = 'SELECT ';
    const items = sqlCompletions(sql, sql.length, tables).filter(
      (item) => item.type === 'column'
    );
    expect(items.map((item) => item.label).sort()).toEqual([
      'email',
      'id',
      'id',
      'user_id',
    ]);
  });

  test('lists columns before keywords after SELECT', () => {
    const sql = 'SELECT ';
    const items = sqlCompletions(sql, sql.length, tables);
    const types = items.map((item) => item.type);
    expect(types.lastIndexOf('column')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('keyword')).toBeGreaterThan(types.lastIndexOf('column'));
    expect(items[0]?.type).toBe('column');
    expect(items.find((item) => item.type === 'column')?.boost).toBeGreaterThan(
      items.find((item) => item.type === 'keyword')?.boost ?? 0
    );
  });

  test('lists columns before keywords after WHERE', () => {
    const sql = 'SELECT id FROM shop.users WHERE ';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items[0]?.type).toBe('column');
    const types = items.map((item) => item.type);
    expect(types.indexOf('keyword')).toBeGreaterThan(types.lastIndexOf('column'));
  });

  test('suggests keywords at the start of a query', () => {
    const items = sqlCompletions('SEL', 3, tables);
    expect(items.some((item) => item.label === 'SELECT' && item.type === 'keyword')).toBe(
      true
    );
  });

  test('inside identifier quotes after FROM suggests tables', () => {
    const sql = 'SELECT * FROM "';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items.map((item) => item.label)).toContain('shop.users');
    expect(items.find((item) => item.label === 'shop.users')?.apply).toBe(
      '"shop"."users"'
    );
  });

  test('inside identifier quotes after schema dot suggests tables in that schema', () => {
    const sql = 'SELECT * FROM "shop"."';
    const items = sqlCompletions(sql, sql.length, tables).filter((item) => item.type === 'table');
    expect(items.map((item) => item.label).sort()).toEqual(['shop.orders', 'shop.users']);
  });

  test('inside identifier quotes after WHERE suggests columns of the FROM table', () => {
    const sql = 'SELECT id FROM shop.users WHERE "';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items.filter((item) => item.type === 'column').map((item) => item.label).sort()).toEqual(
      ['email', 'id']
    );
    expect(items.find((item) => item.label === 'email')?.apply).toBe('"email"');
  });

  test('inside quotes after table qualifier suggests that table’s columns', () => {
    const sql = 'SELECT id FROM shop.users WHERE "users"."em';
    const items = sqlCompletions(sql, sql.length, tables);
    expect(items.map((item) => item.label)).toEqual(['email']);
  });
});
