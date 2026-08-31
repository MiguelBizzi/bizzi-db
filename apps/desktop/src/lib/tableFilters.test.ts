import { describe, expect, test } from 'bun:test';
import { createDefaultFilter, DEFAULT_FILTER_OPERATOR } from './tableFilters';
import { SEARCH_DEBOUNCE_MS } from './useDebouncedValue';

describe('createDefaultFilter', () => {
  test('creates a filter row with equals pre-selected', () => {
    expect(createDefaultFilter('email', 'f_1')).toEqual({
      id: 'f_1',
      column: 'email',
      operator: '=',
      value: '',
      enabled: true,
    });
  });

  test('defaults the operator to equals', () => {
    expect(DEFAULT_FILTER_OPERATOR).toBe('=');
  });
});

describe('SEARCH_DEBOUNCE_MS', () => {
  test('stays in the 300–500ms responsive range', () => {
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });
});
