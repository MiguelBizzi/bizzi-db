import { describe, expect, test } from 'bun:test';
import type { QueryExecutionResult } from '../types';
import {
  clampResultIndex,
  emptySqlTabState,
  pruneSqlTabState,
  replaceResult,
} from './sqlTabState';

const result = (id: string, query = 'select 1'): QueryExecutionResult => ({
  id,
  query,
  timestamp: '',
  executionTimeMs: 1,
});

describe('pruneSqlTabState', () => {
  test('drops state for closed tabs and keeps live ones', () => {
    const state = { a: emptySqlTabState(), b: emptySqlTabState() };
    const next = pruneSqlTabState(state, ['a']);
    expect(Object.keys(next)).toEqual(['a']);
    expect(next.a).toBe(state.a);
  });

  test('returns the same object when nothing is stale', () => {
    const state = { a: emptySqlTabState() };
    expect(pruneSqlTabState(state, ['a', 'c'])).toBe(state);
  });
});

describe('replaceResult', () => {
  test('swaps the data but keeps the id', () => {
    const next = replaceResult([result('r1'), result('r2')], 'r2', result('new', 'select 2'));
    expect(next.map((item) => item.id)).toEqual(['r1', 'r2']);
    expect(next[1].query).toBe('select 2');
  });
});

describe('clampResultIndex', () => {
  test('keeps the index inside the result list', () => {
    expect(clampResultIndex(3, 2)).toBe(1);
    expect(clampResultIndex(-1, 2)).toBe(0);
    expect(clampResultIndex(0, 0)).toBe(0);
    expect(clampResultIndex(1, 3)).toBe(1);
  });
});
