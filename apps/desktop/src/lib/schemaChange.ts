import type { ColumnTypeDef, ColumnTypeFamily } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../types';

export function qualifyTable(
  schema: string,
  name: string,
  quote: (identifier: string) => string,
): string {
  return schema ? `${quote(schema)}.${quote(name)}` : quote(name);
}

export const DEFAULT_VALUE_PRESETS = [
  { label: 'NULL', sql: 'NULL' },
  { label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  { label: 'now()', sql: 'now()' },
  { label: 'gen_random_uuid()', sql: 'gen_random_uuid()' },
  { label: 'true', sql: 'true' },
  { label: 'false', sql: 'false' },
] as const;

export const ON_DELETE_ACTIONS = [
  { value: '', label: 'Default' },
  { value: 'NO ACTION', label: 'NO ACTION' },
  { value: 'RESTRICT', label: 'RESTRICT' },
  { value: 'CASCADE', label: 'CASCADE' },
  { value: 'SET NULL', label: 'SET NULL' },
  { value: 'SET DEFAULT', label: 'SET DEFAULT' },
] as const;

export interface ForeignKeyDraft {
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  onDelete: string;
}

export interface ColumnDraft {
  name: string;
  typeId: string;
  customType?: string;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
  nullable: boolean;
  defaultValue: string;
  unique: boolean;
  checkExpression: string;
  foreignKey: ForeignKeyDraft | null;
}

export interface TableRef {
  schema: string;
  name: string;
}

export function emptyColumnDraft(): ColumnDraft {
  return {
    name: '',
    typeId: 'text',
    nullable: true,
    defaultValue: '',
    unique: false,
    checkExpression: '',
    foreignKey: null,
  };
}

export function parseTypeSql(sqlType: string): {
  base: string;
  length?: number;
  precision?: number;
  scale?: number;
} {
  const trimmed = sqlType.trim();
  const matched = trimmed.match(/^([a-zA-Z_][\w\s.]*(?:\[\])?)\s*\((.+)\)\s*$/);
  if (matched) {
    const base = normalizeTypeName(matched[1].trim());
    const parts = matched[2].split(',').map((part) => part.trim());
    if (parts.length >= 2) {
      const precision = Number(parts[0]);
      const scale = Number(parts[1]);
      return {
        base,
        precision: Number.isFinite(precision) ? precision : undefined,
        scale: Number.isFinite(scale) ? scale : undefined,
      };
    }
    const length = Number(parts[0]);
    return { base, length: Number.isFinite(length) ? length : undefined };
  }
  return { base: normalizeTypeName(trimmed) };
}

function normalizeTypeName(name: string): string {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'character varying': 'varchar',
    character: 'char',
    bool: 'boolean',
    int: 'integer',
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    serial2: 'smallserial',
    serial4: 'serial',
    serial8: 'bigserial',
    float4: 'real',
    float8: 'double precision',
    'double precision': 'double precision',
    decimal: 'numeric',
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'time with time zone': 'timetz',
    'time without time zone': 'time',
  };
  return aliases[n] ?? n;
}

export function typeFamily(sqlType: string): ColumnTypeFamily {
  const { base } = parseTypeSql(sqlType);
  if (
    /^(text|varchar|char|citext|name)$/.test(base) ||
    base.startsWith('character')
  ) {
    return 'text';
  }
  if (
    /^(smallint|integer|bigint|smallserial|serial|bigserial)$/.test(base)
  ) {
    return 'integer';
  }
  if (/^(numeric|decimal|real|double precision|float|money)$/.test(base)) {
    return 'decimal';
  }
  if (base === 'boolean') return 'bool';
  if (base === 'uuid') return 'uuid';
  if (base === 'json' || base === 'jsonb') return 'json';
  if (
    /^(date|time|timetz|timestamp|timestamptz|interval)$/.test(base) ||
    base.startsWith('timestamp') ||
    base.startsWith('time')
  ) {
    return 'temporal';
  }
  if (base === 'bytea') return 'binary';
  return 'other';
}

export function typeChangeRisk(from: string, to: string): 'safe' | 'lossy' | 'incompatible' {
  const a = typeFamily(from);
  const b = typeFamily(to);
  if (a === b) return 'safe';
  if (a === 'text' || b === 'text') return 'lossy';
  if (
    (a === 'integer' && b === 'decimal') ||
    (a === 'decimal' && b === 'integer')
  ) {
    return 'lossy';
  }
  return 'incompatible';
}

export function formatColumnType(draft: ColumnDraft, types: ColumnTypeDef[]): string {
  const def = types.find((entry) => entry.id === draft.typeId);
  if (!def || def.params === 'custom') {
    return (draft.customType ?? '').trim();
  }
  if (def.params === 'length') {
    const length = draft.length ?? def.defaultLength ?? 255;
    return `${def.sqlName}(${length})`;
  }
  if (def.params === 'precisionScale') {
    const precision = draft.precision ?? def.defaultPrecision ?? 10;
    const scale = draft.scale ?? def.defaultScale ?? 0;
    return `${def.sqlName}(${precision},${scale})`;
  }
  return def.sqlName;
}

export function draftFromColumn(column: ColumnDefinition, types: ColumnTypeDef[]): ColumnDraft {
  const parsed = parseTypeSql(column.type);
  const match = types.find((entry) => entry.id === parsed.base && entry.params !== 'custom');
  const fk = column.foreignKey;
  return {
    name: column.name,
    typeId: match ? match.id : 'custom',
    customType: match ? undefined : column.type,
    length: match?.params === 'length' ? parsed.length ?? match.defaultLength : undefined,
    precision:
      match?.params === 'precisionScale' ? parsed.precision ?? match.defaultPrecision : undefined,
    scale: match?.params === 'precisionScale' ? parsed.scale ?? match.defaultScale : undefined,
    nullable: column.isNullable !== false,
    defaultValue: column.defaultValue?.trim() ? column.defaultValue : '',
    unique: column.isUnique === true,
    checkExpression: '',
    foreignKey: fk
      ? {
          targetSchema: fk.targetSchema ?? '',
          targetTable: fk.targetTable,
          targetColumn: fk.targetColumn,
          onDelete: fk.onDelete ?? '',
        }
      : null,
  };
}

export function validateColumnDraft(
  draft: ColumnDraft,
  table: TableSchema,
  types: ColumnTypeDef[],
  options?: { excludeName?: string; tables?: TableSchema[] }
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (!name) {
    errors.name = 'Column name is required';
  } else {
    const taken = table.columns.some(
      (column) => column.name === name && column.name !== options?.excludeName
    );
    if (taken) errors.name = 'A column with this name already exists';
  }

  const def = types.find((entry) => entry.id === draft.typeId);
  if (!def) {
    errors.type = 'Select a data type';
  } else if (def.params === 'custom') {
    if (!(draft.customType ?? '').trim()) errors.type = 'Enter a type';
  } else if (def.params === 'length') {
    const length = draft.length ?? def.defaultLength;
    if (length == null || !Number.isInteger(length) || length <= 0) {
      errors.type = 'Length must be greater than 0';
    }
  } else if (def.params === 'precisionScale') {
    const precision = draft.precision ?? def.defaultPrecision;
    const scale = draft.scale ?? def.defaultScale ?? 0;
    if (precision == null || !Number.isInteger(precision) || precision <= 0) {
      errors.type = 'Precision must be greater than 0';
    } else if (scale < 0 || !Number.isInteger(scale) || scale > precision) {
      errors.type = 'Scale must be between 0 and precision';
    }
  }

  if (draft.foreignKey) {
    const tables = options?.tables ?? [];
    const target = tables.find(
      (candidate) =>
        candidate.name === draft.foreignKey?.targetTable &&
        (!draft.foreignKey.targetSchema || candidate.schema === draft.foreignKey.targetSchema)
    );
    const targetColumn = target?.columns.find(
      (column) => column.name === draft.foreignKey?.targetColumn
    );
    if (!target || !targetColumn) {
      errors.foreignKey = 'Select a valid referenced column';
    }
  }

  return errors;
}

export interface NewTableColumn extends ColumnDraft {
  primaryKey: boolean;
}

export function emptyNewTableColumn(): NewTableColumn {
  return { ...emptyColumnDraft(), primaryKey: false };
}

export function validateNewTable(
  table: TableRef,
  columns: NewTableColumn[],
  types: ColumnTypeDef[],
  tables: TableSchema[]
): { table?: string; columns: Record<string, string>[]; form?: string } {
  const result: { table?: string; columns: Record<string, string>[]; form?: string } = {
    columns: [],
  };
  const name = table.name.trim();
  if (!name) {
    result.table = 'Table name is required';
  } else if (tables.some((t) => t.schema === table.schema && t.name === name)) {
    result.table = 'A table with this name already exists';
  }
  if (columns.length === 0) result.form = 'Add at least one column';
  const seen = new Set<string>();
  const empty: TableSchema = { columns: [] } as unknown as TableSchema;
  result.columns = columns.map((column) => {
    const errors = validateColumnDraft(column, empty, types, { tables });
    const key = column.name.trim();
    if (key && seen.has(key)) errors.name = 'A column with this name already exists';
    seen.add(key);
    return errors;
  });
  return result;
}

export function uniqueIndexName(table: TableSchema, columnName: string): string | undefined {
  const column = table.columns.find((entry) => entry.name === columnName);
  if (column?.isPrimary) return undefined;
  const index = table.indexes.find(
    (entry) => entry.isUnique && entry.columns.length === 1 && entry.columns[0] === columnName
  );
  return index?.name;
}

export function canConfirmDelete(typed: string, columnName: string): boolean {
  return typed.trim() === columnName;
}

export function alterWarnings(
  current: ColumnDefinition,
  draft: ColumnDraft,
  types: ColumnTypeDef[]
): string[] {
  const warnings: string[] = [];
  const nextType = formatColumnType(draft, types);
  const risk = typeChangeRisk(current.type, nextType);
  if (risk === 'lossy') {
    warnings.push(
      `Changing from ${current.type} to ${nextType} may result in data loss or fail if values cannot be cast.`
    );
  } else if (risk === 'incompatible') {
    warnings.push(
      `Changing from ${current.type} to ${nextType} is likely incompatible and may fail or cause data loss.`
    );
  }
  if (current.isNullable !== false && !draft.nullable) {
    warnings.push('Setting NOT NULL will fail if existing rows contain NULL.');
  }
  const hadDefault = Boolean(current.defaultValue?.trim());
  if (hadDefault && !draft.defaultValue.trim()) {
    warnings.push('Removing the default value will not change existing rows.');
  }
  return warnings;
}

export function fkTargetOptions(tables: TableSchema[]): {
  value: string;
  label: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
}[] {
  const options: {
    value: string;
    label: string;
    targetSchema: string;
    targetTable: string;
    targetColumn: string;
  }[] = [];
  for (const table of tables) {
    if (table.isView) continue;
    const sorted = [...table.columns].sort((left, right) => {
      const rank = (column: TableSchema['columns'][number]) =>
        column.isPrimary ? 0 : column.isUnique ? 1 : 2;
      return rank(left) - rank(right);
    });
    for (const column of sorted) {
      const label = `${table.schema}.${table.name}.${column.name}`;
      options.push({
        value: label,
        label,
        targetSchema: table.schema,
        targetTable: table.name,
        targetColumn: column.name,
      });
    }
  }
  return options;
}
