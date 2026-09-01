import { describe, expect, test } from 'bun:test';
import { defaultQuerySql, nextUntitledQueryTitle, queryErrorText, resultTabLabel } from './sqlQuery';

describe('defaultQuerySql', () => {
  test('qualifies schema and table with Postgres identifiers', () => {
    expect(defaultQuerySql({ schema: 'shop', name: 'users' })).toBe(
      'SELECT * FROM "shop"."users" LIMIT 50;'
    );
  });

  test('escapes quotes in identifiers', () => {
    expect(defaultQuerySql({ schema: 'we"ird', name: 't' })).toBe(
      'SELECT * FROM "we""ird"."t" LIMIT 50;'
    );
  });

  test('falls back to pg_catalog when no table is available', () => {
    expect(defaultQuerySql()).toBe('SELECT * FROM pg_catalog.pg_tables LIMIT 50;');
  });
});

describe('nextUntitledQueryTitle', () => {
  test('uses Untitled Query when unused', () => {
    expect(nextUntitledQueryTitle([])).toBe('Untitled Query');
    expect(nextUntitledQueryTitle(['Query 1', 'shop.users'])).toBe('Untitled Query');
  });

  test('appends a number when Untitled Query is taken', () => {
    expect(nextUntitledQueryTitle(['Untitled Query'])).toBe('Untitled Query 2');
    expect(nextUntitledQueryTitle(['Untitled Query', 'Untitled Query 2'])).toBe(
      'Untitled Query 3'
    );
  });
});

describe('queryErrorText', () => {
  test('uses the server message when present', () => {
    expect(queryErrorText('relation "users" does not exist')).toBe(
      'relation "users" does not exist'
    );
  });

  test('falls back when the error string is empty', () => {
    expect(queryErrorText('')).toBe('Query failed with no message from the server.');
    expect(queryErrorText('   ')).toBe('Query failed with no message from the server.');
    expect(queryErrorText(undefined)).toBe('Query failed with no message from the server.');
  });
});

describe('resultTabLabel', () => {
  test('numbers result sets from one', () => {
    expect(resultTabLabel(0)).toBe('Query 1 Results');
    expect(resultTabLabel(3)).toBe('Query 4 Results');
  });
});
