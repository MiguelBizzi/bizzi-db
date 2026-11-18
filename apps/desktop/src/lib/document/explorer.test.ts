import { describe, expect, test } from 'bun:test';
import type { CollectionSchema, DatabaseSchema } from '../../types';
import { collectionCountLabel, collectionDatabases, filterCollections } from './explorer';

const c = (database: string, name: string, patch: Partial<CollectionSchema> = {}): CollectionSchema => ({
  id: `${database}.${name}`,
  database,
  name,
  kind: 'collection',
  capped: false,
  indexes: [],
  ...patch,
});

const collections = [c('shop', 'users'), c('analytics', 'Events'), c('shop', 'orders'), c('analytics', 'sessions')];

describe('filterCollections', () => {
  test('sorts by database then name', () => {
    expect(filterCollections(collections, { search: '', database: 'ALL' }).map((x) => x.id)).toEqual([
      'analytics.Events',
      'analytics.sessions',
      'shop.orders',
      'shop.users',
    ]);
  });

  test('matches the name case-insensitively', () => {
    expect(filterCollections(collections, { search: 'EVENT', database: 'ALL' }).map((x) => x.id)).toEqual([
      'analytics.Events',
    ]);
    expect(filterCollections(collections, { search: 'zzz', database: 'ALL' })).toEqual([]);
  });

  test('narrows to one database', () => {
    expect(filterCollections(collections, { search: '', database: 'shop' }).map((x) => x.name)).toEqual([
      'orders',
      'users',
    ]);
    expect(filterCollections(collections, { search: 'ses', database: 'shop' })).toEqual([]);
  });

  test('does not mutate the input', () => {
    const copy = [...collections];
    filterCollections(collections, { search: '', database: 'ALL' });
    expect(collections).toEqual(copy);
  });
});

describe('collectionDatabases', () => {
  test('lists distinct databases sorted', () => {
    const schema = { collections } as unknown as DatabaseSchema;
    expect(collectionDatabases(schema)).toEqual(['analytics', 'shop']);
  });

  test('tolerates a schema without collections', () => {
    expect(collectionDatabases({} as DatabaseSchema)).toEqual([]);
  });
});

describe('collectionCountLabel', () => {
  test('shows a dash when the count is unknown', () => {
    expect(collectionCountLabel(c('a', 'b'))).toBe('—');
    expect(collectionCountLabel(c('a', 'b', { documentCount: null }))).toBe('—');
  });

  test('formats known counts', () => {
    expect(collectionCountLabel(c('a', 'b', { documentCount: 0 }))).toBe('0');
    expect(collectionCountLabel(c('a', 'b', { documentCount: 1234 }))).toBe('1,234');
  });
});
