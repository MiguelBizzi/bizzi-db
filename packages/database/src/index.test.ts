import { describe, expect, test } from 'bun:test';
import {
  columnTypesFor,
  DIALECTS,
  dialectMeta,
  indexMethod,
  methodSupportsInclude,
  storageParamsFor,
  SUPPORTED_DIALECTS,
  versionAtLeast,
} from './index';

describe('quoteSqlIdent', () => {
  test('wraps identifiers in double quotes and doubles embedded quotes', () => {
    expect(DIALECTS.PostgreSQL.quoteIdent('users')).toBe('"users"');
    expect(DIALECTS.PostgreSQL.quoteIdent('we"ird')).toBe('"we""ird"');
    expect(DIALECTS.PostgreSQL.quoteIdent('users"; DROP TABLE t; --')).toBe(
      '"users""; DROP TABLE t; --"'
    );
  });
});

describe('dialectMeta', () => {
  test('returns PostgreSQL and MySQL, and undefined for other dialects', () => {
    expect(dialectMeta('PostgreSQL')?.defaultPort).toBe(5432);
    expect(dialectMeta('MySQL')?.defaultPort).toBe(3306);
    expect(dialectMeta('MySQL')?.capabilities.transactionalDdl).toBe(false);
    expect(dialectMeta('SQLite')).toBeUndefined();
    expect(SUPPORTED_DIALECTS.map((d) => d.id)).toEqual(['PostgreSQL', 'MySQL']);
  });
});

describe('columnTypesFor', () => {
  test('returns a Postgres catalog with param slots and a custom type', () => {
    const types = columnTypesFor('PostgreSQL');
    expect(types).toBeDefined();
    const byId = Object.fromEntries((types ?? []).map((entry) => [entry.id, entry]));
    expect(byId.varchar?.params).toBe('length');
    expect(byId.varchar?.defaultLength).toBe(255);
    expect(byId.numeric?.params).toBe('precisionScale');
    expect(byId.jsonb?.sqlName).toBe('jsonb');
    expect(byId.custom?.params).toBe('custom');
    expect(types?.some((entry) => entry.id === 'text[]')).toBe(true);
  });

  test('returns undefined for dialects without a catalog', () => {
    expect(columnTypesFor('MySQL')?.some((type) => type.id === 'varchar')).toBe(true);
    expect(columnTypesFor('MySQL')?.find((type) => type.id === 'datetime')).toMatchObject({
      params: 'length',
      minLength: 0,
      maxLength: 6,
    });
    expect(DIALECTS.MySQL.foreignKeyActions.some((action) => action.value === 'SET DEFAULT')).toBe(
      false,
    );
    expect(columnTypesFor('SQLite')).toBeUndefined();
    expect(columnTypesFor('ClickHouse')).toBeUndefined();
    expect(columnTypesFor('DuckDB')).toBeUndefined();
  });
});

describe('quoteLiteral', () => {
  test('doubles single quotes', () => {
    expect(DIALECTS.PostgreSQL.quoteLiteral("it's")).toBe("'it''s'");
  });

  test('escapes backslashes for MySQL and leaves them literal for PostgreSQL', () => {
    expect(DIALECTS.MySQL.quoteLiteral("C:\\temp")).toBe("'C:\\\\temp'");
    expect(DIALECTS.MySQL.quoteLiteral("it's")).toBe("'it''s'");
    expect(DIALECTS.PostgreSQL.quoteLiteral("C:\\temp")).toBe("'C:\\temp'");
  });
});

describe('object capabilities', () => {
  const indexes = DIALECTS.PostgreSQL.objects.indexes;

  test('only btree supports unique and per-key ordering', () => {
    const unique = indexes.methods.filter((m) => m.unique).map((m) => m.id);
    const ordering = indexes.methods.filter((m) => m.ordering).map((m) => m.id);
    expect(unique).toEqual(['btree']);
    expect(ordering).toEqual(['btree']);
  });

  test('INCLUDE support follows the server version per method', () => {
    const gist = indexMethod(indexes, 'GIST')!;
    expect(methodSupportsInclude(gist, 110_000)).toBe(false);
    expect(methodSupportsInclude(gist, 120_000)).toBe(true);
    expect(methodSupportsInclude(indexMethod(indexes, 'gin')!, 170_000)).toBe(false);
  });

  test('version-gated storage params', () => {
    const btree = indexMethod(indexes, 'btree')!;
    expect(storageParamsFor(btree, 120_000).map((p) => p.name)).toEqual(['fillfactor']);
    expect(storageParamsFor(btree, 160_000).map((p) => p.name)).toContain('deduplicate_items');
  });

  test('versionAtLeast treats unknown versions as supported and null as never', () => {
    expect(versionAtLeast(undefined, 150_000)).toBe(true);
    expect(versionAtLeast(140_000, 150_000)).toBe(false);
    expect(versionAtLeast(160_000, null)).toBe(false);
  });
});
