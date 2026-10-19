import { describe, expect, test } from 'bun:test';
import type { QueryExecutionResult } from '../types';
import { firstExecutionError } from './executionResult';

function result(error?: string): QueryExecutionResult {
  return { id: 'r', query: 'q', timestamp: '', executionTimeMs: 0, error };
}

describe('firstExecutionError', () => {
  test('is undefined when every statement succeeded', () => {
    expect(firstExecutionError([result(), result()])).toBeUndefined();
    expect(firstExecutionError([])).toBeUndefined();
  });

  test('finds a failure after a successful BEGIN', () => {
    expect(firstExecutionError([result(), result('boom'), result('later')])).toBe('boom');
  });
});
