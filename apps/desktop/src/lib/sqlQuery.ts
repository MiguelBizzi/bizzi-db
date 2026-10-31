import type { DatabaseDialect } from '../types';
import { moduleFor, qualify } from './dialectQuote';

export function qualifyTableSql(
  schema: string | undefined,
  name: string,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  return qualify(dialect, schema ?? '', name);
}

export function defaultQuerySql(
  table?: { schema: string; name: string },
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  if (!table?.name) {
    return moduleFor(dialect).capabilities.backtickIdents
      ? 'SELECT 1;'
      : 'SELECT * FROM pg_catalog.pg_tables LIMIT 50;';
  }
  return `SELECT * FROM ${qualifyTableSql(table.schema, table.name, dialect)} LIMIT 50;`;
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
