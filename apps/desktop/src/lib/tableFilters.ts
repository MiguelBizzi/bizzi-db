import type { FilterClause, SortClause } from '../types';

export const DEFAULT_FILTER_OPERATOR: FilterClause['operator'] = '=';

export function createDefaultFilter(columnName: string, id?: string): FilterClause {
  return {
    id: id ?? `f_${Date.now()}`,
    column: columnName,
    operator: DEFAULT_FILTER_OPERATOR,
    value: '',
    enabled: true,
  };
}

export function applySearch<T extends Record<string, unknown>>(
  rows: T[],
  searchTerm: string
): T[] {
  if (!searchTerm) return rows;
  const needle = searchTerm.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(needle))
  );
}

export function filterNeedsValue(operator: FilterClause['operator']): boolean {
  return operator !== 'IS NULL' && operator !== 'IS NOT NULL';
}

export function isFilterIncomplete(filter: FilterClause): boolean {
  return filterNeedsValue(filter.operator) && !filter.value;
}

/**
 * The rules the database should apply: enabled ones that have what they need.
 * Filtering runs in the query (like the SQL editor), not on the loaded page.
 */
export function activeFilters(filters: FilterClause[]): FilterClause[] {
  return filters.filter((filter) => filter.enabled && !isFilterIncomplete(filter));
}

/** Identifies the conditions a set of rules applies, ignoring rule ids. */
export function filtersKey(filters: FilterClause[]): string {
  return JSON.stringify(filters.map(({ column, operator, value }) => [column, operator, value]));
}

export function applySort<T extends Record<string, unknown>>(
  rows: T[],
  sort: SortClause | null
): T[] {
  if (!sort) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const valA = a[sort.column];
    const valB = b[sort.column];
    if (valA === valB) return 0;
    if (valA == null) return sort.direction === 'ASC' ? -1 : 1;
    if (valB == null) return sort.direction === 'ASC' ? 1 : -1;
    if (valA < valB) return sort.direction === 'ASC' ? -1 : 1;
    if (valA > valB) return sort.direction === 'ASC' ? 1 : -1;
    return 0;
  });
  return copy;
}

export function applyTableView<T extends Record<string, unknown>>(
  rows: T[],
  options: {
    searchTerm?: string;
    sort?: SortClause | null;
  }
): T[] {
  const searched = applySearch(rows, options.searchTerm ?? '');
  return applySort(searched, options.sort ?? null);
}

export function setFilterEnabled(
  filters: FilterClause[],
  id: string,
  enabled: boolean
): FilterClause[] {
  return filters.map((filter) => (filter.id === id ? { ...filter, enabled } : filter));
}

export function filterRuleFieldsClass(enabled: boolean): string {
  return enabled
    ? 'flex items-center gap-2 min-w-0'
    : 'flex items-center gap-2 min-w-0 opacity-50';
}
