import { describe, expect, test } from 'bun:test';
import type { DatabaseSchema, TableSchema } from '../types';
import {
  createSchemaSyncQueue,
  mergeExplorerTags,
  shouldSkipSchemaIntrospect,
} from './schemaSync';

function table(id: string, extras: Partial<TableSchema> = {}): TableSchema {
  return {
    id,
    name: id.split('.')[1] ?? id,
    schema: 'shop',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: [],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

function schema(tables: TableSchema[]): DatabaseSchema {
  return {
    id: 'conn_1',
    name: 'Local',
    dialect: 'PostgreSQL',
    version: '16',
    connectionHost: '127.0.0.1',
    connectionPort: 5432,
    environment: 'development',
    status: 'connected',
    tables,
    totalSizeMb: 1,
    activeConnections: 1,
    queriesPerSecond: 0,
  };
}

describe('shouldSkipSchemaIntrospect', () => {
  test('skips when the catalog fingerprint is unchanged', () => {
    expect(shouldSkipSchemaIntrospect(false, 'abc', 'abc')).toBe(true);
  });

  test('introspects on force, first load, or a changed fingerprint', () => {
    expect(shouldSkipSchemaIntrospect(true, 'abc', 'abc')).toBe(false);
    expect(shouldSkipSchemaIntrospect(false, undefined, 'abc')).toBe(false);
    expect(shouldSkipSchemaIntrospect(false, 'abc', 'def')).toBe(false);
  });
});

describe('mergeExplorerTags', () => {
  test('keeps locally added tags when introspection replaces a table', () => {
    const previous = schema([table('shop.users', { tags: ['core', 'auth'] })]);
    const incoming = schema([
      table('shop.users', { rowCount: 12, tags: [] }),
      table('shop.orders'),
    ]);
    const merged = mergeExplorerTags(previous, incoming);
    expect(merged.tables.find((t) => t.id === 'shop.users')?.tags).toEqual(['core', 'auth']);
    expect(merged.tables.find((t) => t.id === 'shop.users')?.rowCount).toBe(12);
    expect(merged.tables.find((t) => t.id === 'shop.orders')?.tags).toEqual([]);
  });

  test('returns incoming schema when there is nothing to merge', () => {
    const incoming = schema([table('shop.users')]);
    expect(mergeExplorerTags(undefined, incoming)).toBe(incoming);
  });
});

describe('createSchemaSyncQueue', () => {
  test('coalesces overlapping checks and runs one trailing pass', async () => {
    let started = 0;
    const gates: Array<() => void> = [];
    const enqueue = createSchemaSyncQueue(async () => {
      started += 1;
      await new Promise<void>((resolve) => {
        gates.push(resolve);
      });
    });

    const first = enqueue();
    void enqueue();
    void enqueue();
    expect(started).toBe(1);
    expect(gates).toHaveLength(1);

    gates[0]();
    await first;
    expect(started).toBe(2);
    expect(gates).toHaveLength(2);
    gates[1]();
  });
});
