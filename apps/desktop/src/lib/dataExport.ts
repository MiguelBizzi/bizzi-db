import { exportSaveFile, type ExportFile } from '@db/core';
import type { DatabaseDialect } from '../types';
import { formatAccelerator, type Platform } from './commands/accelerator';
import { currentPlatform } from './commands/shortcutLabel';
import { ident, moduleFor, qualify, stringLiteral } from './dialectQuote';

export function copyCsvShortcut(platform: Platform = currentPlatform()): string {
  return formatAccelerator('CmdOrCtrl+C', platform);
}

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
    /\bfrom\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*))(?:\s*\.\s*(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*)))?/i
  );
  if (!match) return { schema: '', table: 'query_result' };
  const first = match[1] || match[2] || match[3];
  const second = match[4] || match[5] || match[6];
  if (second) return { schema: first, table: second };
  return { schema: '', table: first };
}

export function formatExport(
  input: DataExportInput,
  format: DataExportFormat,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  switch (format) {
    case 'csv':
      return formatCsv(input);
    case 'json':
      return formatJson(input);
    case 'markdown':
      return formatMarkdown(input);
    case 'sql':
      return formatSqlInsert(input, dialect);
  }
}

export function exportFileName(input: DataExportInput, format: DataExportFormat): string {
  const ext = DATA_EXPORT_FORMATS.find((item) => item.id === format)?.extension ?? format;
  const base = sanitizeFileName(input.tableName || 'query_result');
  return `${base}_export.${ext}`;
}

/**
 * Writes text to the clipboard. Webviews only allow that inside the user
 * gesture that asked for it, so text that is still being produced (rows being
 * fetched) goes in as a promise and the write is started right away.
 */
export async function writeClipboard(text: string | Promise<string>): Promise<void> {
  if (typeof text === 'string') {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}

export async function copyExport(
  input: DataExportInput,
  format: DataExportFormat
): Promise<void> {
  await writeClipboard(formatExport(input, format));
}

export function buildExportFile(input: DataExportInput, format: DataExportFormat): ExportFile {
  const meta = DATA_EXPORT_FORMATS.find((item) => item.id === format);
  const body = formatExport(input, format);
  return {
    fileName: exportFileName(input, format),
    filterLabel: meta?.label ?? format,
    extension: meta?.extension ?? format,
    // The BOM makes Excel read the CSV as UTF-8.
    content: format === 'csv' ? `\uFEFF${body}` : body,
  };
}

export function saveExport(input: DataExportInput, format: DataExportFormat): Promise<string | null> {
  return exportSaveFile(buildExportFile(input, format));
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

function formatSqlInsert(
  { columns, rows, tableName, schema }: DataExportInput,
  dialect: DatabaseDialect,
): string {
  if (rows.length === 0 || columns.length === 0) return '';
  const table = qualify(dialect, schema || '', tableName || 'query_result');
  const cols = columns.map((column) => ident(dialect, column)).join(', ');
  const tuples = rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column], dialect)).join(', ');
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

export function sqlLiteral(value: unknown, dialect: DatabaseDialect = 'PostgreSQL'): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return moduleFor(dialect).booleanLiteral(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return moduleFor(dialect).quoteLiteral(value.toISOString());
  if (typeof value === 'object') {
    return moduleFor(dialect).quoteLiteral(JSON.stringify(value));
  }
  return stringLiteral(dialect, String(value));
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


function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'export';
}
