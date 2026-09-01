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
