import type { FilterClause } from '../types';

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
