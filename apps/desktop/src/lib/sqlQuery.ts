import { DIALECTS } from '@db/database';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export function qualifyTableSql(schema: string | undefined, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

export function defaultQuerySql(table?: { schema: string; name: string }): string {
  if (!table?.name) {
    return 'SELECT * FROM pg_catalog.pg_tables LIMIT 50;';
  }
  return `SELECT * FROM ${qualifyTableSql(table.schema, table.name)} LIMIT 50;`;
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
