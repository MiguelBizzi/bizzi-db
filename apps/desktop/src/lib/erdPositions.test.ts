import { describe, expect, test } from 'bun:test';
import {
  clearErdPositions,
  erdPositionsKey,
  readErdPositions,
  writeErdPositions,
} from './erdPositions';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('erd positions storage', () => {
  test('keys positions per database', () => {
    expect(erdPositionsKey('db_1')).toBe('erd-layout:db_1');
  });

  test('round-trips positions', () => {
    const storage = memoryStorage();
    writeErdPositions(storage, 'db_1', { 'public.users': { x: 12, y: 40 } });
    expect(readErdPositions(storage, 'db_1')).toEqual({
      'public.users': { x: 12, y: 40 },
    });
  });

  test('ignores junk and missing keys', () => {
    const storage = memoryStorage({ 'erd-layout:db_1': 'not-json' });
    expect(readErdPositions(storage, 'db_1')).toEqual({});
    expect(readErdPositions(storage, 'missing')).toEqual({});
  });

  test('clear removes stored overrides', () => {
    const storage = memoryStorage();
    writeErdPositions(storage, 'db_1', { a: { x: 1, y: 2 } });
    clearErdPositions(storage, 'db_1');
    expect(readErdPositions(storage, 'db_1')).toEqual({});
    expect(storage.store.size).toBe(0);
  });
});
