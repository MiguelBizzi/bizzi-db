import { DIALECTS, type ColumnTypeDef, type ColumnTypeFamily } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../types';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

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

export function qualifyTable(schema: string, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
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

function defaultSql(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function referencesClause(fk: ForeignKeyDraft): string {
  const target = qualifyTable(fk.targetSchema, fk.targetTable);
  const onDelete = fk.onDelete.trim() ? ` ON DELETE ${fk.onDelete.trim()}` : '';
  return ` REFERENCES ${target} (${quoteIdent(fk.targetColumn)})${onDelete}`;
}

export function buildAddColumnSql(
  table: TableRef,
  draft: ColumnDraft,
  types: ColumnTypeDef[]
): string {
  const typeSql = formatColumnType(draft, types);
  const parts = [
    `ALTER TABLE ${qualifyTable(table.schema, table.name)} ADD COLUMN ${quoteIdent(draft.name.trim())} ${typeSql}`,
  ];
  if (!draft.nullable) parts.push('NOT NULL');
  const fallback = defaultSql(draft.defaultValue);
  if (fallback) parts.push(`DEFAULT ${fallback}`);
  if (draft.unique) parts.push('UNIQUE');
  const check = draft.checkExpression.trim();
  if (check) parts.push(`CHECK (${check})`);
  if (draft.foreignKey) parts.push(referencesClause(draft.foreignKey).trimStart());
  return `${parts.join(' ')};`;
}

export function uniqueIndexName(table: TableSchema, columnName: string): string | undefined {
  const column = table.columns.find((entry) => entry.name === columnName);
  if (column?.isPrimary) return undefined;
  const index = table.indexes.find(
    (entry) => entry.isUnique && entry.columns.length === 1 && entry.columns[0] === columnName
  );
  return index?.name;
}

function constraintIdent(table: string, column: string, suffix: string): string {
  return quoteIdent(`${table}_${column}_${suffix}`);
}

function typesEqual(left: string, right: string): boolean {
  const a = parseTypeSql(left);
  const b = parseTypeSql(right);
  return (
    a.base === b.base && a.length === b.length && a.precision === b.precision && a.scale === b.scale
  );
}

function fkEqual(
  current: ColumnDefinition['foreignKey'] | undefined,
  draft: ForeignKeyDraft | null
): boolean {
  if (!current && !draft) return true;
  if (!current || !draft) return false;
  return (
    (current.targetSchema ?? '') === (draft.targetSchema ?? '') &&
    current.targetTable === draft.targetTable &&
    current.targetColumn === draft.targetColumn &&
    (current.onDelete ?? '') === (draft.onDelete ?? '')
  );
}

export function buildAlterColumnSql(
  table: TableSchema,
  current: ColumnDefinition,
  draft: ColumnDraft,
  types: ColumnTypeDef[]
): string {
  const nextName = draft.name.trim();
  const working = nextName;
  const statements: string[] = [];
  const qualified = qualifyTable(table.schema, table.name);

  if (nextName && nextName !== current.name) {
    statements.push(
      `ALTER TABLE ${qualified} RENAME COLUMN ${quoteIdent(current.name)} TO ${quoteIdent(nextName)};`
    );
  }

  const nextType = formatColumnType(draft, types);
  const columnActions: string[] = [];
  if (!typesEqual(current.type, nextType)) {
    columnActions.push(`ALTER COLUMN ${quoteIdent(working)} TYPE ${nextType}`);
  }
  const currentNullable = current.isNullable !== false;
  if (currentNullable !== draft.nullable) {
    columnActions.push(
      draft.nullable
        ? `ALTER COLUMN ${quoteIdent(working)} DROP NOT NULL`
        : `ALTER COLUMN ${quoteIdent(working)} SET NOT NULL`
    );
  }
  const currentDefault = current.defaultValue?.trim() ?? '';
  const nextDefault = draft.defaultValue.trim();
  if (currentDefault !== nextDefault) {
    columnActions.push(
      nextDefault
        ? `ALTER COLUMN ${quoteIdent(working)} SET DEFAULT ${nextDefault}`
        : `ALTER COLUMN ${quoteIdent(working)} DROP DEFAULT`
    );
  }
  if (columnActions.length > 0) {
    statements.push(`ALTER TABLE ${qualified} ${columnActions.join(', ')};`);
  }

  const currentlyUnique = current.isUnique === true;
  if (currentlyUnique && !draft.unique) {
    const indexName = uniqueIndexName(table, current.name);
    if (indexName) {
      statements.push(`ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(indexName)};`);
    }
  }
  if (!currentlyUnique && draft.unique) {
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${constraintIdent(table.name, working, 'key')} UNIQUE (${quoteIdent(working)});`
    );
  }

  const check = draft.checkExpression.trim();
  if (check) {
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${constraintIdent(table.name, working, 'check')} CHECK (${check});`
    );
  }

  if (draft.foreignKey && !fkEqual(current.foreignKey, draft.foreignKey)) {
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${constraintIdent(table.name, working, 'fkey')} FOREIGN KEY (${quoteIdent(working)})${referencesClause(draft.foreignKey)};`
    );
  }

  return statements.join('\n');
}

export function buildDropColumnSql(table: TableRef, columnName: string): string {
  return `ALTER TABLE ${qualifyTable(table.schema, table.name)} DROP COLUMN ${quoteIdent(columnName)};`;
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

export function buildTableDdlPreview(table: TableSchema): string {
  const quote = DIALECTS.PostgreSQL.quoteIdent;
  const cols = table.columns
    .map((column) => {
      const bits = [`  ${quote(column.name)} ${column.type}`];
      if (column.isPrimary) bits.push('PRIMARY KEY');
      if (column.isNullable === false) bits.push('NOT NULL');
      if (column.defaultValue?.trim()) bits.push(`DEFAULT ${column.defaultValue}`);
      return bits.join(' ');
    })
    .join(',\n');
  const indexes = table.indexes
    .map((index) => {
      const unique = index.isUnique ? 'UNIQUE ' : '';
      const colsSql = index.columns.map((name) => quote(name)).join(', ');
      return `CREATE ${unique}INDEX ${quote(index.name)} ON ${qualifyTable(table.schema, table.name)} USING ${index.type} (${colsSql});`;
    })
    .join('\n');
  const header = `-- Table DDL for ${table.schema}.${table.name}\nCREATE TABLE ${qualifyTable(table.schema, table.name)} (\n${cols}\n);`;
  return indexes ? `${header}\n\n${indexes}` : header;
}
