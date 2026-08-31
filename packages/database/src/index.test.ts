import { describe, expect, test } from 'bun:test';
import { DIALECTS, dialectMeta, SUPPORTED_DIALECTS } from './index';

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
