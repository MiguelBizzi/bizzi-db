import { DIALECTS } from '@db/database';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export const COPY_CSV_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? '⌘C'
    : 'Ctrl+C';

export type DataExportFormat = 'csv' | 'json' | 'markdown' | 'sql';

export interface DataExportInput {
  columns: string[];
  rows: Record<string, unknown>[];
  tableName?: string;
  schema?: string;
}

export const DATA_EXPORT_FORMATS: {
  id: DataExportFormat;
  label: string;
  extension: string;
}[] = [
  { id: 'csv', label: 'CSV', extension: 'csv' },
  { id: 'json', label: 'JSON', extension: 'json' },
  { id: 'markdown', label: 'Markdown', extension: 'md' },
  { id: 'sql', label: 'SQL', extension: 'sql' },
];

export function inferQualifiedTable(sql?: string): { schema: string; table: string } {
  if (!sql) return { schema: '', table: 'query_result' };
  const stripped = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const match = stripped.match(
    /\bfrom\s+(?:"([^"]+)"|([A-Za-z_][\w$]*))(?:\s*\.\s*(?:"([^"]+)"|([A-Za-z_][\w$]*)))?/i
  );
  if (!match) return { schema: '', table: 'query_result' };
  const first = match[1] || match[2];
  const second = match[3] || match[4];
  if (second) return { schema: first, table: second };
  return { schema: '', table: first };
}

export function formatExport(input: DataExportInput, format: DataExportFormat): string {
  switch (format) {
    case 'csv':
      return formatCsv(input);
    case 'json':
      return formatJson(input);
    case 'markdown':
      return formatMarkdown(input);
    case 'sql':
      return formatSqlInsert(input);
  }
}

export function exportFileName(input: DataExportInput, format: DataExportFormat): string {
  const ext = DATA_EXPORT_FORMATS.find((item) => item.id === format)?.extension ?? format;
  const base = sanitizeFileName(input.tableName || 'query_result');
  return `${base}_export.${ext}`;
}

export async function copyExport(
  input: DataExportInput,
  format: DataExportFormat
): Promise<void> {
  await navigator.clipboard.writeText(formatExport(input, format));
}

export function downloadExport(input: DataExportInput, format: DataExportFormat): void {
  const body = formatExport(input, format);
  const content = format === 'csv' ? `\uFEFF${body}` : body;
  const blob = new Blob([content], { type: mimeType(format) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(input, format);
  link.click();
  URL.revokeObjectURL(url);
}

function formatCsv({ columns, rows }: DataExportInput): string {
  const header = columns.map(csvField).join(',');
  const body = rows.map((row) => columns.map((column) => csvField(row[column])).join(','));
  return [header, ...body].join('\n');
}

function formatJson({ columns, rows }: DataExportInput): string {
  const payload = rows.map((row) => {
    const object: Record<string, unknown> = {};
    for (const column of columns) {
      object[column] = row[column] === undefined ? null : row[column];
    }
    return object;
  });
  return JSON.stringify(payload, null, 2);
}

function formatMarkdown({ columns, rows }: DataExportInput): string {
  const header = `| ${columns.map(mdCell).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => mdCell(row[column])).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function formatSqlInsert({ columns, rows, tableName, schema }: DataExportInput): string {
  if (rows.length === 0 || columns.length === 0) return '';
  const table = qualifyTable(schema || '', tableName || 'query_result');
  const cols = columns.map(quoteIdent).join(', ');
  const tuples = rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column])).join(', ');
    return `(${values})`;
  });
  return `INSERT INTO ${table} (${cols}) VALUES\n  ${tuples.join(',\n  ')};`;
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = stringifyCell(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function mdCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return stringifyCell(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stringifyCell(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function qualifyTable(schema: string, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'export';
}

function mimeType(format: DataExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'sql':
      return 'application/sql;charset=utf-8';
  }
}
