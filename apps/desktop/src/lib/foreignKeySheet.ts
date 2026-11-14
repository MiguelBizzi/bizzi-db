import type { ColumnDefinition, DatabaseDialect, FilterClause, TableSchema } from '../types';
import { ident, moduleFor, pagedSql, qualify } from './dialectQuote';

export const FK_SHEET_PAGE = 50;

const MAX_COLUMNS = 6;
const MAX_TERMS = 5;

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

// LIKE over these either fails (bytea, arrays on some engines) or matches serialized noise.
function isSearchableType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return !(
    t.includes('json') ||
    t.includes('bytea') ||
    t.includes('blob') ||
    t.includes('binary') ||
    t === 'rowversion' ||
    t === 'image' ||
    t.includes('xml') ||
    t.includes('[]') ||
    t.startsWith('vector') ||
    t.includes('tsvector') ||
    t.includes('geometry') ||
    t.includes('geography')
  );
}

export function sheetColumns(
  table: TableSchema,
  targetColumn: string,
  max = MAX_COLUMNS,
): string[] {
  const picked: string[] = [];
  const add = (name: string) => {
    if (picked.length < max && !picked.includes(name)) picked.push(name);
  };
  if (table.columns.some((column) => column.name === targetColumn)) add(targetColumn);
  const searchable = table.columns.filter((column) => isSearchableType(column.type));
  for (const hint of LABEL_HINTS) {
    const match = searchable.find((column) => column.name.toLowerCase() === hint);
    if (match) add(match.name);
  }
  for (const column of searchable) add(column.name);
  return picked;
}

export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (const match of query.matchAll(pattern)) {
    const term = (match[1] ?? match[2] ?? '').trim();
    if (term && !terms.includes(term)) terms.push(term);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

function containsPattern(raw: string): string {
  const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

export function filterClauseSql(dialect: DatabaseDialect, filter: FilterClause): string | null {
  const meta = moduleFor(dialect);
  const column = ident(dialect, filter.column);
  switch (filter.operator) {
    case 'IS NULL':
    case 'IS NOT NULL':
      return `${column} ${filter.operator}`;
    case 'IN': {
      const values = filter.value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (values.length === 0) return null;
      return `${column} IN (${values.map((value) => meta.quoteLiteral(value)).join(', ')})`;
    }
    case 'ILIKE':
      if (!filter.value) return null;
      return meta.caseInsensitiveLike(column, meta.quoteLiteral(filter.value));
    default:
      if (!filter.value) return null;
      return `${column} ${filter.operator} ${meta.quoteLiteral(filter.value)}`;
  }
}

export interface SheetQuery {
  table: TableSchema;
  targetColumn: string;
  query: string;
  filters: FilterClause[];
  offset: number;
  limit?: number;
  dialect: DatabaseDialect;
}

/** Fetches one row past `limit` so the caller can tell whether another page exists. */
export function buildSheetSql({
  table,
  targetColumn,
  query,
  filters,
  offset,
  limit = FK_SHEET_PAGE,
  dialect,
}: SheetQuery): string {
  const meta = moduleFor(dialect);
  const columns = sheetColumns(table, targetColumn);
  const known = new Set(table.columns.map((column) => column.name));
  const conditions: string[] = [];

  for (const term of searchTerms(query)) {
    const pattern = meta.quoteLiteral(containsPattern(term));
    const anyColumn = columns
      .map((column) => meta.caseInsensitiveLike(ident(dialect, column), pattern))
      .join(' OR ');
    conditions.push(`(${anyColumn})`);
  }
  for (const filter of filters) {
    if (!filter.enabled || !known.has(filter.column)) continue;
    const sql = filterClauseSql(dialect, filter);
    if (sql) conditions.push(sql);
  }

  const select = `SELECT ${columns.map((column) => ident(dialect, column)).join(', ')} FROM ${qualify(dialect, table.schema, table.name)}`;
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const order = ` ORDER BY ${ident(dialect, targetColumn)}`;
  return `${pagedSql(dialect, `${select}${where}${order}`, Math.max(1, limit) + 1, Math.max(0, offset))};`;
}

export function moveHighlight(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), count - 1);
}

export function canChooseReferencedRow(
  column: ColumnDefinition | undefined,
  state: { locked: boolean; pendingDelete: boolean },
): boolean {
  return Boolean(column?.foreignKey) && !state.locked && !state.pendingDelete;
}
