import { describe, expect, test } from 'bun:test';
import type { FilterClause } from '../types';
import {
  applyFilters,
  applySearch,
  applySort,
  applyTableView,
  createDefaultFilter,
  DEFAULT_FILTER_OPERATOR,
} from './tableFilters';
import { SEARCH_DEBOUNCE_MS } from './useDebouncedValue';

const rows = [
  { id: 1, name: 'Ada', role: 'admin', age: 30 },
  { id: 2, name: 'Alan', role: 'staff', age: 40 },
  { id: 3, name: 'Grace', role: null, age: 35 },
];

function filter(
  extras: Partial<FilterClause> & Pick<FilterClause, 'column' | 'operator'>
): FilterClause {
  return {
    id: extras.id ?? 'f1',
    value: extras.value ?? '',
    enabled: extras.enabled ?? true,
    ...extras,
  };
}

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

describe('applySearch', () => {
  test('matches any column case-insensitively and ignores empty terms', () => {
    expect(applySearch(rows, 'ada').map((row) => row.id)).toEqual([1]);
    expect(applySearch(rows, '')).toEqual(rows);
  });
});

describe('applyFilters', () => {
  test('equals, not-equals, like/ilike, and numeric compares', () => {
    expect(applyFilters(rows, [filter({ column: 'name', operator: '=', value: 'Ada' })]).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, [filter({ column: 'name', operator: '!=', value: 'Ada' })]).map((r) => r.id)).toEqual([
      2, 3,
    ]);
    expect(applyFilters(rows, [filter({ column: 'name', operator: 'LIKE', value: 'a' })]).map((r) => r.id)).toEqual([
      1, 2, 3,
    ]);
    expect(applyFilters(rows, [filter({ column: 'name', operator: 'ILIKE', value: 'GRACE' })]).map((r) => r.id)).toEqual([
      3,
    ]);
    expect(applyFilters(rows, [filter({ column: 'age', operator: '>', value: '35' })]).map((r) => r.id)).toEqual([2]);
    expect(applyFilters(rows, [filter({ column: 'age', operator: '<', value: '35' })]).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, [filter({ column: 'age', operator: '>=', value: '35' })]).map((r) => r.id)).toEqual([
      2, 3,
    ]);
    expect(applyFilters(rows, [filter({ column: 'age', operator: '<=', value: '35' })]).map((r) => r.id)).toEqual([
      1, 3,
    ]);
  });

  test('IS NULL, IN, disabled filters, empty values, and NaN compares', () => {
    expect(applyFilters(rows, [filter({ column: 'role', operator: 'IS NULL' })]).map((r) => r.id)).toEqual([3]);
    expect(applyFilters(rows, [filter({ column: 'role', operator: 'IS NOT NULL' })]).map((r) => r.id)).toEqual([
      1, 2,
    ]);
    expect(
      applyFilters(rows, [filter({ column: 'name', operator: 'IN', value: 'Ada, Grace' })]).map((r) => r.id)
    ).toEqual([1, 3]);
    expect(
      applyFilters(rows, [filter({ column: 'name', operator: '=', value: 'Ada', enabled: false })]).map((r) => r.id)
    ).toEqual([1, 2, 3]);
    expect(
      applyFilters(rows, [filter({ column: 'name', operator: '=', value: '' })]).map((r) => r.id)
    ).toEqual([1, 2, 3]);
    expect(
      applyFilters(rows, [filter({ column: 'name', operator: '>', value: 'abc' })]).map((r) => r.id)
    ).toEqual([]);
  });
});

describe('applySort / applyTableView', () => {
  test('sorts and combines search with filters', () => {
    expect(applySort(rows, { column: 'name', direction: 'ASC' }).map((r) => r.name)).toEqual([
      'Ada',
      'Alan',
      'Grace',
    ]);
    expect(applySort(rows, { column: 'age', direction: 'DESC' }).map((r) => r.age)).toEqual([40, 35, 30]);
    expect(
      applyTableView(rows, {
        searchTerm: 'a',
        filters: [filter({ column: 'age', operator: '>=', value: '35' })],
        sort: { column: 'name', direction: 'ASC' },
      }).map((r) => r.name)
    ).toEqual(['Alan', 'Grace']);
  });
});
