import { DIALECTS } from '@db/database';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export interface SqlSchemaTable {
  schema: string;
  name: string;
  columns: { name: string }[];
}

export interface SqlCompletion {
  label: string;
  apply: string;
  type: 'keyword' | 'table' | 'column' | 'schema';
  detail?: string;
  boost?: number;
}

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'ON',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'AS',
  'ORDER',
  'GROUP',
  'BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'INDEX',
  'VIEW',
  'WITH',
  'DISTINCT',
  'UNION',
  'ALL',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'RETURNING',
  'TRUNCATE',
  'EXPLAIN',
];

const TABLE_KEYWORDS = new Set([
  'FROM',
  'JOIN',
  'INTO',
  'UPDATE',
  'TABLE',
]);

const COLUMN_KEYWORDS = new Set([
  'SELECT',
  'WHERE',
  'SET',
  'ON',
  'BY',
  'HAVING',
  'AND',
  'OR',
  'RETURNING',
]);

export function sqlCompletions(
  sql: string,
  cursor: number,
  tables: SqlSchemaTable[]
): SqlCompletion[] {
  const at = Math.max(0, Math.min(cursor, sql.length));
  const before = sql.slice(0, at);
  const { prefix, keyword, parts, inQuote } = readPrefix(before);
  const needle = prefix.toLowerCase();
  const kind = completionKind(keyword);

  if (kind === 'table') {
    const schemaFilter = parts.length >= 2 ? parts[0]?.toLowerCase() : undefined;
    const tableNeedle = (parts.length >= 2 ? parts[parts.length - 1] : prefix).toLowerCase();
    let items = tableCompletions(tables);
    if (schemaFilter) {
      items = items.filter(
        (item) =>
          item.type === 'table' && item.label.toLowerCase().startsWith(`${schemaFilter}.`)
      );
    }
    return filterByPrefix(items, tableNeedle || needle);
  }
  if (kind === 'column') {
    const qualifier = parts.length >= 2 ? parts[parts.length - 2] : undefined;
    const columnNeedle = (parts.length >= 2 ? parts[parts.length - 1] : prefix).toLowerCase();
    const byName = qualifier
      ? tables.filter(
          (table) =>
            table.name.toLowerCase() === qualifier.toLowerCase() ||
            (table.schema && table.schema.toLowerCase() === qualifier.toLowerCase())
        )
      : referencedTables(sql, tables);
    const source = byName.length > 0 ? byName : referencedTables(sql, tables);
    const columns = columnCompletions(source.length > 0 ? source : tables);
    const keywords = inQuote ? [] : keywordCompletions(columnNeedle || needle);
    return [...filterByPrefix(columns, columnNeedle || needle), ...keywords];
  }
  return keywordCompletions(needle);
}

function completionKind(keyword: string | null): 'table' | 'column' | 'keyword' {
  if (!keyword) return 'keyword';
  if (TABLE_KEYWORDS.has(keyword)) return 'table';
  if (COLUMN_KEYWORDS.has(keyword)) return 'column';
  return 'keyword';
}

function tableCompletions(tables: SqlSchemaTable[]): SqlCompletion[] {
  const schemas = [...new Set(tables.map((table) => table.schema).filter(Boolean))];
  return [
    ...schemas.map((schema) => ({
      label: schema,
      apply: quoteIdent(schema),
      type: 'schema' as const,
      detail: 'schema',
      boost: 2,
    })),
    ...tables.map((table) => ({
      label: table.schema ? `${table.schema}.${table.name}` : table.name,
      apply: table.schema
        ? `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`
        : quoteIdent(table.name),
      type: 'table' as const,
      detail: 'table',
      boost: 5,
    })),
  ];
}

function columnCompletions(tables: SqlSchemaTable[]): SqlCompletion[] {
  return tables.flatMap((table) =>
    table.columns.map((column) => ({
      label: column.name,
      apply: quoteIdent(column.name),
      type: 'column' as const,
      detail: table.schema ? `${table.schema}.${table.name}` : table.name,
      boost: 10,
    }))
  );
}

function keywordCompletions(needle: string): SqlCompletion[] {
  return SQL_KEYWORDS.filter((keyword) => keyword.toLowerCase().startsWith(needle)).map(
    (keyword) => ({
      label: keyword,
      apply: keyword,
      type: 'keyword' as const,
      detail: 'keyword',
      boost: 0,
    })
  );
}

function filterByPrefix(items: SqlCompletion[], needle: string): SqlCompletion[] {
  if (!needle) return items;
  return items.filter((item) => {
    const label = item.label.toLowerCase();
    const apply = item.apply.toLowerCase().replaceAll('"', '');
    return label.startsWith(needle) || label.includes(`.${needle}`) || apply.startsWith(needle);
  });
}

function referencedTables(sql: string, tables: SqlSchemaTable[]): SqlSchemaTable[] {
  const lower = sql.toLowerCase();
  return tables.filter((table) => {
    const name = table.name.toLowerCase();
    const qualified = table.schema ? `${table.schema.toLowerCase()}.${name}` : name;
    return lower.includes(name) || lower.includes(qualified);
  });
}

function readPrefix(before: string): {
  prefix: string;
  keyword: string | null;
  parts: string[];
  inQuote: boolean;
} {
  const token = trailingIdentToken(before);
  const { parts, inQuote } = parseIdentToken(token);
  const prefix = (parts.at(-1) ?? '').replaceAll('"', '');
  const rest = before.slice(0, before.length - token.length);
  const tokens = tokenizeKeywords(rest);
  return { prefix, keyword: tokens.at(-1) ?? null, parts, inQuote };
}

function trailingIdentToken(before: string): string {
  let i = before.length;
  while (i > 0) {
    const c = before[i - 1];
    if (/[A-Za-z0-9_."]/.test(c)) {
      i -= 1;
      continue;
    }
    break;
  }
  return before.slice(i);
}

function parseIdentToken(token: string): { parts: string[]; inQuote: boolean } {
  if (!token) return { parts: [''], inQuote: false };
  const parts: string[] = [];
  let i = 0;
  let inQuote = false;
  while (i < token.length) {
    if (token[i] === '.') {
      if (parts.length === 0) parts.push('');
      i += 1;
      if (i >= token.length) {
        parts.push('');
        inQuote = false;
      }
      continue;
    }
    if (token[i] === '"') {
      inQuote = true;
      i += 1;
      let buf = '';
      while (i < token.length && token[i] !== '"') {
        buf += token[i];
        i += 1;
      }
      if (i < token.length && token[i] === '"') {
        inQuote = false;
        i += 1;
      }
      parts.push(buf);
      continue;
    }
    inQuote = false;
    let buf = '';
    while (i < token.length && /[A-Za-z0-9_]/.test(token[i])) {
      buf += token[i];
      i += 1;
    }
    parts.push(buf);
  }
  return { parts: parts.length > 0 ? parts : [''], inQuote };
}

function tokenizeKeywords(sql: string): string[] {
  const tokens: string[] = [];
  const chars = [...sql];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (c === '-' && chars[i + 1] === '-') {
      i += 2;
      while (i < chars.length && chars[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && chars[i + 1] === '*') {
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"') {
      const quote = c;
      i += 1;
      while (i < chars.length) {
        if (chars[i] === quote) {
          if (chars[i + 1] === quote) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let ident = c;
      i += 1;
      while (i < chars.length && /[A-Za-z0-9_]/.test(chars[i])) {
        ident += chars[i];
        i += 1;
      }
      tokens.push(ident.toUpperCase());
      continue;
    }
    i += 1;
  }
  return tokens;
}
