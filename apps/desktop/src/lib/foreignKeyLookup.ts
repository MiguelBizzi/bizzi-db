import { DIALECTS } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../types';
import { sqlLiteral as typedSqlLiteral } from './dataExport';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export const FK_LOOKUP_PAGE = 20;

const LABEL_HINTS = [
  'name',
  'full_name',
  'display_name',
  'title',
  'email',
  'username',
  'user_name',
  'slug',
  'label',
  'code',
];

function qualifyTable(schema: string, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function ilikePattern(raw: string): string {
  const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

function isSearchableType(type: string): boolean {
  const t = type.trim().toLowerCase();
  if (
    t.includes('json') ||
    t.includes('bytea') ||
    t.includes('xml') ||
    t.includes('[]') ||
    t.startsWith('vector') ||
    t.includes('tsvector')
  ) {
    return false;
  }
  return true;
}

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

export function lookupColumns(table: TableSchema, targetColumn: string): string[] {
  const picked: string[] = [];
  const add = (name: string) => {
    if (!picked.includes(name) && table.columns.some((column) => column.name === name)) {
      picked.push(name);
    }
  };
  add(targetColumn);
  for (const hint of LABEL_HINTS) {
    const match = table.columns.find(
      (column) => column.name.toLowerCase() === hint && isSearchableType(column.type)
    );
    if (match) add(match.name);
    if (picked.length >= 4) return picked;
  }
  for (const column of table.columns) {
    if (picked.length >= 3) break;
    if (!isSearchableType(column.type)) continue;
    add(column.name);
  }
  return picked;
}

export function buildLookupSql(
  table: TableSchema,
  targetColumn: string,
  query: string,
  offset: number,
  limit = FK_LOOKUP_PAGE
): string {
  const columns = lookupColumns(table, targetColumn);
  const qualified = qualifyTable(table.schema, table.name);
  const selectList = columns.map(quoteIdent).join(', ');
  const fetch = Math.max(1, limit) + 1;
  const start = Math.max(0, offset);
  const order = quoteIdent(targetColumn);
  const trimmed = query.trim();
  if (!trimmed) {
    return `SELECT ${selectList} FROM ${qualified} ORDER BY ${order} LIMIT ${fetch} OFFSET ${start};`;
  }
  const pattern = sqlLiteral(ilikePattern(trimmed));
  const where = columns
    .map((column) => `CAST(${quoteIdent(column)} AS text) ILIKE ${pattern} ESCAPE '\\'`)
    .join(' OR ');
  return `SELECT ${selectList} FROM ${qualified} WHERE ${where} ORDER BY ${order} LIMIT ${fetch} OFFSET ${start};`;
}

export function rowKeyValue(row: Record<string, unknown>, targetColumn: string): string {
  const value = row[targetColumn];
  if (value === null || value === undefined) return '';
  return String(value);
}

export function rowSecondaryLabel(
  row: Record<string, unknown>,
  targetColumn: string
): string {
  return Object.entries(row)
    .filter(([column, value]) => column !== targetColumn && value !== null && value !== undefined)
    .map(([column, value]) => `${column}: ${String(value)}`)
    .filter((part) => !part.endsWith(': '))
    .join(' · ');
}

export function foreignKeyPreviewSql(
  table: TableSchema,
  targetColumn: string,
  value: unknown
): string {
  const qualified = qualifyTable(table.schema, table.name);
  return `SELECT * FROM ${qualified} WHERE ${quoteIdent(targetColumn)} = ${typedSqlLiteral(value)} LIMIT 1;`;
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
