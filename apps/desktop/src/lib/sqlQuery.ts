import type { DatabaseDialect } from '../types';
import { moduleFor, pagedSql, qualify } from './dialectQuote';

export function qualifyTableSql(
  schema: string | undefined,
  name: string,
  dialect: DatabaseDialect,
): string {
  return qualify(dialect, schema ?? '', name);
}

export function defaultQuerySql(
  table: { schema: string; name: string } | undefined,
  dialect: DatabaseDialect,
): string {
  const meta = moduleFor(dialect);
  if (!table?.name) return meta.emptyEditorSql;
  return `${pagedSql(dialect, `SELECT * FROM ${qualifyTableSql(table.schema, table.name, dialect)}`, 50, 0)};`;
}

export function nextUntitledQueryTitle(existingTitles: string[]): string {
  const used = new Set(existingTitles);
  if (!used.has('Untitled Query')) return 'Untitled Query';
  let n = 2;
  while (used.has(`Untitled Query ${n}`)) n += 1;
  return `Untitled Query ${n}`;
}

export function queryErrorText(error: string | undefined): string {
  const trimmed = error?.trim();
  return trimmed || 'Query failed with no message from the server.';
}

export function resultTabLabel(index: number): string {
  return `Query ${index + 1} Results`;
}
