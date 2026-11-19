import { describe, expect, test } from 'bun:test';
import type { SavedQuery } from '../types';
import { savedQueriesFor } from './savedQueries';

const query = (id: string, databaseId: string) => ({ id, databaseId }) as SavedQuery;
const profiles = [
  { id: 'pg', dialect: 'PostgreSQL' as const },
  { id: 'my', dialect: 'MySQL' as const },
  { id: 'mongo', dialect: 'MongoDB' as const },
];
const queries = [query('a', 'pg'), query('b', 'mongo'), query('c', 'my'), query('d', 'gone')];

describe('savedQueriesFor', () => {
  test('a document connection sees only document queries', () => {
    expect(savedQueriesFor(queries, profiles, 'mongo').map((q) => q.id)).toEqual(['b']);
  });

  test('a relational connection hides document queries and keeps other SQL connections', () => {
    expect(savedQueriesFor(queries, profiles, 'pg').map((q) => q.id)).toEqual(['a', 'c', 'd']);
  });

  test('without an active connection the list is the SQL one', () => {
    expect(savedQueriesFor(queries, profiles, null).map((q) => q.id)).toEqual(['a', 'c', 'd']);
  });
});
