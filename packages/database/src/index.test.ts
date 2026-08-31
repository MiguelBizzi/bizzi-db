import { describe, expect, test } from 'bun:test';
import { columnTypesFor, DIALECTS, dialectMeta, SUPPORTED_DIALECTS } from './index';

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
  test('returns PostgreSQL and undefined for unsupported dialects', () => {
    expect(dialectMeta('PostgreSQL')?.defaultPort).toBe(5432);
    expect(dialectMeta('MySQL')).toBeUndefined();
    expect(SUPPORTED_DIALECTS).toHaveLength(1);
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
    expect(columnTypesFor('MySQL')).toBeUndefined();
    expect(columnTypesFor('SQLite')).toBeUndefined();
    expect(columnTypesFor('ClickHouse')).toBeUndefined();
    expect(columnTypesFor('DuckDB')).toBeUndefined();
  });
});
