import type { ColumnDefinition, DatabaseDialect, FilterClause, TableSchema } from '../types';
import { sqlLiteral as typedSqlLiteral } from './dataExport';
import { ident, pagedSql, qualify } from './dialectQuote';
import { filterFromCell } from './tableCellActions';

export function resolveReferencedTable(
  tables: TableSchema[],
  source: TableSchema,
  fk: NonNullable<ColumnDefinition['foreignKey']>
): TableSchema | undefined {
  const byName = tables.filter((table) => table.name === fk.targetTable);
  if (fk.targetSchema) {
    const exact = byName.find((table) => table.schema === fk.targetSchema);
    if (exact) return exact;
  }
  return byName.find((table) => table.schema === source.schema) ?? byName[0];
}

export function rowKeyValue(row: Record<string, unknown>, targetColumn: string): string {
  const value = row[targetColumn];
  if (value === null || value === undefined) return '';
  return String(value);
}

export function foreignKeyPreviewSql(
  table: TableSchema,
  targetColumn: string,
  value: unknown,
  dialect: DatabaseDialect,
): string {
  const qualified = qualify(dialect, table.schema, table.name);
  return `${pagedSql(dialect, `SELECT * FROM ${qualified} WHERE ${ident(dialect, targetColumn)} = ${typedSqlLiteral(value, dialect)}`, 1, 0)};`;
}

export function columnsForForeignRow(
  table: TableSchema | undefined,
  targetColumn: string,
  row: Record<string, unknown> | null
): string[] {
  const schemaCols = table?.columns.map((column) => column.name) ?? [];
  const pkCols =
    table?.columns.filter((column) => column.isPrimary).map((column) => column.name) ?? [];
  const rowKeys = row ? Object.keys(row) : [];
  const ordered = [
    ...pkCols,
    ...(schemaCols.includes(targetColumn) || rowKeys.includes(targetColumn)
      ? [targetColumn]
      : []),
    ...schemaCols,
    ...rowKeys,
  ];
  const seen = new Set<string>();
  return ordered.filter((name) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function foreignRowClipboardText(
  columns: string[],
  row: Record<string, unknown>
): string {
  const copy: Record<string, unknown> = {};
  for (const name of columns) copy[name] = row[name] ?? null;
  return JSON.stringify(copy, null, 2);
}

export function foreignKeyGoToFilter(
  targetColumn: string,
  value: unknown,
  id?: string
): FilterClause {
  return filterFromCell(targetColumn, 'equals', value, id);
}

export function floaterPosition(
  anchor: { top: number; left: number; bottom: number; right: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8
): { top: number; left: number } {
  let top = anchor.bottom + gap;
  let left = anchor.left;
  if (top + size.height > viewport.height - gap) {
    top = Math.max(gap, anchor.top - gap - size.height);
  }
  if (left + size.width > viewport.width - gap) {
    left = Math.max(gap, viewport.width - gap - size.width);
  }
  if (left < gap) left = gap;
  if (top < gap) top = gap;
  return { top, left };
}
