import { describe, expect, test } from 'bun:test';
import { refreshConnectionSchemas } from './refreshSchemas';

describe('refreshConnectionSchemas', () => {
  test('reloads schema for the given connection', async () => {
    const seen: string[] = [];
    const error = await refreshConnectionSchemas(async (id) => {
      seen.push(id);
    }, 'conn_1');
    expect(seen).toEqual(['conn_1']);
    expect(error).toBeNull();
  });

  test('returns a message when introspection fails', async () => {
    const error = await refreshConnectionSchemas(async () => {
      throw new Error('not connected');
    }, 'conn_1');
    expect(error).toBe('not connected');
  });
});
