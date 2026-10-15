import { describe, expect, test } from 'bun:test';
import type { FilterClause } from '../types';
import {
  activeFilters,
  applySearch,
  applySort,
  applyTableView,
  createDefaultFilter,
  filtersKey,
  DEFAULT_FILTER_OPERATOR,
  filterRuleFieldsClass,
  setFilterEnabled,
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

describe('activeFilters', () => {
  test('keeps enabled rules that are complete, in order', () => {
    const rules = [
      filter({ id: 'a', column: 'id', operator: '=', value: '4477' }),
      filter({ id: 'b', column: 'role', operator: 'IS NULL' }),
      filter({ id: 'c', column: 'role', operator: 'IS NOT NULL' }),
    ];
    expect(activeFilters(rules).map((rule) => rule.id)).toEqual(['a', 'b', 'c']);
  });

  test('drops disabled rules and rules still missing a value', () => {
    const rules = [
      filter({ id: 'off', column: 'name', operator: '=', value: 'Ada', enabled: false }),
      filter({ id: 'blank', column: 'name', operator: '=', value: '' }),
      filter({ id: 'on', column: 'role', operator: '=', value: 'admin' }),
    ];
    expect(activeFilters(rules).map((rule) => rule.id)).toEqual(['on']);
    expect(activeFilters(setFilterEnabled(rules, 'off', true)).map((rule) => rule.id)).toEqual([
      'off',
      'on',
    ]);
    expect(activeFilters(setFilterEnabled(rules, 'on', false))).toEqual([]);
  });
});

describe('filtersKey', () => {
  test('is the same for the same conditions whatever the rule ids', () => {
    const a = [filter({ id: 'x', column: 'id', operator: '=', value: '1' })];
    const b = [filter({ id: 'y', column: 'id', operator: '=', value: '1' })];
    expect(filtersKey(a)).toBe(filtersKey(b));
  });

  test('changes when a column, operator or value changes', () => {
    const base = filter({ column: 'id', operator: '=', value: '1' });
    const keys = new Set([
      filtersKey([base]),
      filtersKey([{ ...base, column: 'age' }]),
      filtersKey([{ ...base, operator: '>' }]),
      filtersKey([{ ...base, value: '2' }]),
      filtersKey([]),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('setFilterEnabled', () => {
  test('toggles a rule without dropping it or changing its condition', () => {
    const clauses = [
      filter({ id: 'keep', column: 'name', operator: '=', value: 'Ada' }),
      filter({ id: 'pause', column: 'role', operator: '=', value: 'staff' }),
    ];
    const paused = setFilterEnabled(clauses, 'pause', false);
    expect(paused).toHaveLength(2);
    expect(paused[1]).toEqual({
      id: 'pause',
      column: 'role',
      operator: '=',
      value: 'staff',
      enabled: false,
    });
    expect(paused[0].enabled).toBe(true);
    expect(setFilterEnabled(paused, 'pause', true)[1].enabled).toBe(true);
  });
});

describe('filterRuleFieldsClass', () => {
  test('dims deactivated rules and leaves active rules at full opacity', () => {
    expect(filterRuleFieldsClass(true)).not.toContain('opacity-50');
    expect(filterRuleFieldsClass(false)).toContain('opacity-50');
  });
});

describe('applySort / applyTableView', () => {
  test('sorts and searches the rows already loaded', () => {
    expect(applySort(rows, { column: 'name', direction: 'ASC' }).map((r) => r.name)).toEqual([
      'Ada',
      'Alan',
      'Grace',
    ]);
    expect(applySort(rows, { column: 'age', direction: 'DESC' }).map((r) => r.age)).toEqual([40, 35, 30]);
    expect(
      applyTableView(rows, {
        searchTerm: 'a',
        sort: { column: 'name', direction: 'DESC' },
      }).map((r) => r.name)
    ).toEqual(['Grace', 'Alan', 'Ada']);
  });
});
