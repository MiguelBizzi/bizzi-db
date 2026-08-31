import { DIALECTS } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../types';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export type InsertFieldMode = 'default' | 'null' | 'now' | 'value';

export interface InsertFieldState {
  mode: InsertFieldMode;
  input: string;
}

export type InsertSqlValue =
  | { kind: 'omit' }
  | { kind: 'null' }
  | { kind: 'expr'; sql: string }
  | { kind: 'literal'; value: unknown };

function typeName(column: ColumnDefinition): string {
  return column.type.trim().toLowerCase();
}

export function enumValuesFor(column: ColumnDefinition): string[] {
  if (column.enumValues && column.enumValues.length > 0) return column.enumValues;
  const match = column.type.match(/^enum\s*\((.*)\)\s*$/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

export function isTimestampType(type: string): boolean {
  const t = type.trim().toLowerCase();
  if (t.includes('timestamp') || t.includes('datetime')) return true;
  if (t === 'date' || t.startsWith('date(')) return true;
  if (t === 'time' || t.startsWith('time ') || t.startsWith('time(') || t.startsWith('timetz')) {
    return true;
  }
  return false;
}

export function isBooleanType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === 'boolean' || t === 'bool' || t.startsWith('boolean') || t.startsWith('bool ');
}

export function isIntegerType(type: string): boolean {
  return /^(int|int2|int4|int8|integer|smallint|bigint|serial|smallserial|bigserial)\b/i.test(
    type.trim()
  );
}

export function isDecimalType(type: string): boolean {
  return /^(numeric|decimal|real|double|float|money)\b/i.test(type.trim());
}

export function isJsonType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === 'json' || t === 'jsonb' || t.startsWith('json');
}

export function isLongTextType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === 'text' || t.startsWith('text ') || isJsonType(type);
}

export function hasDefault(column: ColumnDefinition): boolean {
  return Boolean(column.defaultValue);
}

export function isNullable(column: ColumnDefinition): boolean {
  return column.isNullable !== false;
}

export function isRequired(column: ColumnDefinition): boolean {
  return !isNullable(column) && !hasDefault(column);
}

export function initialFieldState(column: ColumnDefinition): InsertFieldState {
  if (hasDefault(column)) return { mode: 'default', input: '' };
  if (isNullable(column)) return { mode: 'null', input: '' };
  return { mode: 'value', input: '' };
}

export function initialFields(columns: ColumnDefinition[]): Record<string, InsertFieldState> {
  return Object.fromEntries(columns.map((column) => [column.name, initialFieldState(column)]));
}

export function fieldError(column: ColumnDefinition, field: InsertFieldState): string | null {
  if (field.mode === 'default' || field.mode === 'null' || field.mode === 'now') return null;
  const trimmed = field.input.trim();
  if (trimmed === '') {
    return isRequired(column) ? 'This field is required' : null;
  }
  const enums = enumValuesFor(column);
  if (enums.length > 0 && !enums.includes(field.input)) {
    return 'Select a valid value';
  }
  const type = typeName(column);
  if (isBooleanType(type) && field.input !== 'true' && field.input !== 'false') {
    return 'Invalid data type';
  }
  if (isIntegerType(type) && !/^-?\d+$/.test(trimmed)) {
    return 'Invalid data type';
  }
  if (isDecimalType(type) && !Number.isFinite(Number(trimmed))) {
    return 'Invalid data type';
  }
  if (isJsonType(type)) {
    try {
      JSON.parse(field.input);
    } catch {
      return 'Invalid data type';
    }
  }
  return null;
}

export function validateFields(
  columns: ColumnDefinition[],
  fields: Record<string, InsertFieldState>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const column of columns) {
    const field = fields[column.name] ?? initialFieldState(column);
    const error = fieldError(column, field);
    if (error) errors[column.name] = error;
  }
  return errors;
}

function coerceValue(column: ColumnDefinition, input: string): unknown {
  const type = typeName(column);
  if (isBooleanType(type)) return input === 'true';
  if (isIntegerType(type)) return Number.parseInt(input, 10);
  if (isJsonType(type)) {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input;
}

export function assignmentFromField(
  column: ColumnDefinition,
  field: InsertFieldState
): InsertSqlValue {
  switch (field.mode) {
    case 'default':
      return { kind: 'omit' };
    case 'null':
      return { kind: 'null' };
    case 'now':
      return { kind: 'expr', sql: 'now()' };
    case 'value':
      return { kind: 'literal', value: coerceValue(column, field.input) };
  }
}

function qualifyTable(schema: string, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatAssignment(value: InsertSqlValue): string | null {
  switch (value.kind) {
    case 'omit':
      return null;
    case 'null':
      return 'NULL';
    case 'expr':
      return value.sql;
    case 'literal':
      return sqlLiteral(value.value);
  }
}

export function buildInsertSql(
  table: TableSchema,
  fields: Record<string, InsertFieldState>
): string {
  const qualified = qualifyTable(table.schema, table.name);
  const included: { column: string; sql: string }[] = [];
  for (const column of table.columns) {
    const field = fields[column.name] ?? initialFieldState(column);
    const formatted = formatAssignment(assignmentFromField(column, field));
    if (formatted === null) continue;
    included.push({ column: column.name, sql: formatted });
  }
  if (included.length === 0) {
    return `INSERT INTO ${qualified} DEFAULT VALUES;`;
  }
  const cols = included.map((entry) => quoteIdent(entry.column)).join(', ');
  const vals = included.map((entry) => entry.sql).join(', ');
  return `INSERT INTO ${qualified} (${cols}) VALUES (${vals});`;
}
