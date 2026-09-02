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

function cellMatches(row: Record<string, unknown>, filter: FilterClause): boolean {
  const raw = row[filter.column];
  if (filter.operator === 'IS NULL') {
    return raw === null || raw === undefined;
  }
  if (filter.operator === 'IS NOT NULL') {
    return raw !== null && raw !== undefined;
  }

  const cellVal = String(raw ?? '').toLowerCase();
  const targetVal = filter.value.toLowerCase();
  switch (filter.operator) {
    case '=':
      return cellVal === targetVal;
    case '!=':
      return cellVal !== targetVal;
    case 'LIKE':
    case 'ILIKE':
      return cellVal.includes(targetVal);
    case '>':
    case '<':
    case '>=':
    case '<=': {
      const left = Number(cellVal);
      const right = Number(targetVal);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (filter.operator === '>') return left > right;
      if (filter.operator === '<') return left < right;
      if (filter.operator === '>=') return left >= right;
      return left <= right;
    }
    case 'IN': {
      const wanted = filter.value
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      return wanted.includes(cellVal);
    }
    default:
      return true;
  }
}

export function filterNeedsValue(operator: FilterClause['operator']): boolean {
  return operator !== 'IS NULL' && operator !== 'IS NOT NULL';
}

export function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: FilterClause[]
): T[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (!filter.enabled) return true;
      if (filterNeedsValue(filter.operator) && !filter.value) return true;
      return cellMatches(row, filter);
    })
  );
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
    filters?: FilterClause[];
    sort?: SortClause | null;
  }
): T[] {
  const searched = applySearch(rows, options.searchTerm ?? '');
  const filtered = applyFilters(searched, options.filters ?? []);
  return applySort(filtered, options.sort ?? null);
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
