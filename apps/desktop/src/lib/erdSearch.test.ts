import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import { columnKey, searchErd } from './erdSearch';

function column(
  name: string,
  extras: Partial<ColumnDefinition> = {}
): ColumnDefinition {
  return { name, type: extras.type ?? 'text', ...extras };
}

function table(name: string, extras: Partial<TableSchema> = {}): TableSchema {
  return {
    id: extras.id ?? `public.${name}`,
    name,
    schema: extras.schema ?? 'public',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: extras.columns ?? [column('id', { isPrimary: true })],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

describe('searchErd', () => {
  const orgs = table('organizations', {
    columns: [column('id', { isPrimary: true }), column('name')],
  });
  const users = table('users', {
    schema: 'auth',
    id: 'auth.users',
    columns: [column('id', { isPrimary: true }), column('email', { type: 'citext' })],
  });
  const tables = [orgs, users];

  test('returns no hits for an empty query without dropping tables', () => {
    expect(searchErd(tables, '')).toEqual({ tableIds: [], columnKeys: [] });
    expect(searchErd(tables, '   ')).toEqual({ tableIds: [], columnKeys: [] });
  });

  test('matches table name case-insensitively', () => {
    const hits = searchErd(tables, 'USER');
    expect(hits.tableIds).toEqual(['auth.users']);
  });

  test('matches schema name', () => {
    const hits = searchErd(tables, 'auth');
    expect(hits.tableIds).toEqual(['auth.users']);
  });

  test('matches column names and records column keys', () => {
    const hits = searchErd(tables, 'email');
    expect(hits.tableIds).toEqual(['auth.users']);
    expect(hits.columnKeys).toEqual([columnKey(users.id, 'email')]);
  });

  test('never filters the table list — unmatched tables are simply not highlighted', () => {
    const hits = searchErd(tables, 'organizations');
    expect(hits.tableIds).toEqual(['public.organizations']);
    expect(tables).toHaveLength(2);
  });
});
