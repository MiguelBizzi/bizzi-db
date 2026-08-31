import type { ColumnDefinition, FilterClause } from '../types';
import { hasDefault, isDecimalType, isIntegerType, isNullable } from './insertRow';
import { isSetColumnDefault } from './pendingChanges';

export type CellFilterOp = 'equals' | 'notEquals' | 'contains' | 'gt' | 'lt';

export interface SetAsContext {
  isView: boolean;
  isPendingDelete: boolean;
}

function cellIsNull(value: unknown): boolean {
  return value === null || value === undefined;
}

export function cellClipboardText(value: unknown): string {
  if (cellIsNull(value) || isSetColumnDefault(value)) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function truncateLabel(text: string, max = 32): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function stringifyFilterValue(value: unknown): string {
  if (cellIsNull(value)) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function filterFromCell(
  column: string,
  op: CellFilterOp,
  value: unknown,
  id?: string
): FilterClause {
  const base: FilterClause = {
    id: id ?? `f_${Date.now()}`,
    column,
    operator: '=',
    value: stringifyFilterValue(value),
    enabled: true,
  };

  if (op === 'equals' && cellIsNull(value)) {
    return { ...base, operator: 'IS NULL', value: '' };
  }
  if (op === 'notEquals' && cellIsNull(value)) {
    return { ...base, operator: 'IS NOT NULL', value: '' };
  }

  switch (op) {
    case 'equals':
      return { ...base, operator: '=' };
    case 'notEquals':
      return { ...base, operator: '!=' };
    case 'contains':
      return { ...base, operator: 'LIKE' };
    case 'gt':
      return { ...base, operator: '>' };
    case 'lt':
      return { ...base, operator: '<' };
  }
}

export function isNumericColumn(column: ColumnDefinition): boolean {
  return isIntegerType(column.type) || isDecimalType(column.type);
}

export function numericFilterOps(column: ColumnDefinition): Array<'gt' | 'lt'> {
  return isNumericColumn(column) ? ['gt', 'lt'] : [];
}

function canMutateCell(ctx: SetAsContext): boolean {
  return !ctx.isView && !ctx.isPendingDelete;
}

export function canSetEmpty(ctx: SetAsContext): boolean {
  return canMutateCell(ctx);
}

export function canSetNull(column: ColumnDefinition, ctx: SetAsContext): boolean {
  return canMutateCell(ctx) && isNullable(column);
}

export function canSetDefault(column: ColumnDefinition, ctx: SetAsContext): boolean {
  return canMutateCell(ctx) && hasDefault(column);
}

export function tableFooterRange(opts: {
  rowCount: number;
  rangeStart: number;
  rangeEnd: number;
  selectedCount: number;
}): string {
  if (!Number.isFinite(opts.rowCount) || opts.rowCount < 0) {
    return opts.selectedCount > 0 ? `${opts.selectedCount} selected` : '';
  }
  if (opts.rowCount === 0) return 'No rows';
  const range = `Showing ${opts.rangeStart.toLocaleString()}–${opts.rangeEnd.toLocaleString()} of ${opts.rowCount.toLocaleString()}`;
  if (opts.selectedCount > 0) return `${range} (${opts.selectedCount} selected)`;
  return range;
}
