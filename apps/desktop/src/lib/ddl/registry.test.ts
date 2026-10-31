import { describe, expect, test } from 'bun:test';
import { objectDdlFor } from './registry';

describe('objectDdlFor', () => {
  test('provides PostgreSQL and nothing for dialects not built yet', () => {
    expect(objectDdlFor('PostgreSQL')?.createIndex).toBeFunction();
    expect(objectDdlFor('MySQL')?.createIndex).toBeFunction();
    expect(objectDdlFor('SQLite')).toBeUndefined();
  });
});
