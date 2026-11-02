import { DIALECTS, type ColumnTypeDef } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../../../types';
import {
  formatColumnType,
  parseTypeSql,
  qualifyTable,
  uniqueIndexName,
  type ColumnDraft,
  type ForeignKeyDraft,
  type NewTableColumn,
  type TableRef,
} from '../../schemaChange';

const { quoteIdent, quoteLiteral } = DIALECTS.SQLServer;
const qualify = (schema: string, name: string) => qualifyTable(schema, name, quoteIdent);

function typesEqual(left: string, right: string): boolean {
  const a = parseTypeSql(left);
  const b = parseTypeSql(right);
  return a.base === b.base && a.length === b.length && a.precision === b.precision && a.scale === b.scale;
}

function defaultExpr(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    /^-?\d+(\.\d+)?$/.test(trimmed) ||
    /^N?'/.test(trimmed) ||
    trimmed.startsWith('0x') ||
    /^\(.*\)$/.test(trimmed) ||
    /^[A-Za-z_][\w]*\s*\(/.test(trimmed) ||
    trimmed.toUpperCase() === 'NULL'
  ) {
    return `(${trimmed})`;
  }
  return `(${quoteLiteral(trimmed)})`;
}

function columnSql(draft: ColumnDraft, types: ColumnTypeDef[]): string {
  const typeSql = formatColumnType(draft, types);
  const nullSql = draft.nullable ? 'NULL' : 'NOT NULL';
  const fallback = defaultExpr(draft.defaultValue);
  const parts = [`${quoteIdent(draft.name.trim())} ${typeSql} ${nullSql}`];
  if (fallback) parts.push(`DEFAULT ${fallback}`);
  return parts.join(' ');
}

function fkEqual(
  current: ColumnDefinition['foreignKey'] | undefined,
  draft: ForeignKeyDraft | null,
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

function referencesClause(fk: ForeignKeyDraft): string {
  const target = qualify(fk.targetSchema, fk.targetTable);
  const onDelete = fk.onDelete.trim() ? ` ON DELETE ${fk.onDelete.trim()}` : '';
  return ` REFERENCES ${target} (${quoteIdent(fk.targetColumn)})${onDelete}`;
}

export function buildAddColumnSql(table: TableRef, draft: ColumnDraft, types: ColumnTypeDef[]): string {
  return `ALTER TABLE ${qualify(table.schema, table.name)} ADD ${columnSql(draft, types)};`;
}

export function buildCreateTableSql(
  table: TableRef,
  columns: NewTableColumn[],
  types: ColumnTypeDef[],
): string {
  const lines = columns.map((column) => `  ${columnSql(column, types)}`);
  const pk = columns.filter((column) => column.primaryKey).map((column) => quoteIdent(column.name.trim()));
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
  return `CREATE TABLE ${qualify(table.schema, table.name.trim())} (\n${lines.join(',\n')}\n);`;
}

function renameColumn(schema: string, table: string, from: string, to: string): string {
  const old = `${quoteIdent(schema)}.${quoteIdent(table)}.${quoteIdent(from)}`;
  return `EXEC sp_rename ${quoteLiteral(old)}, ${quoteLiteral(to)}, N'COLUMN';`;
}

export function buildAlterColumnSql(
  table: TableSchema,
  current: ColumnDefinition,
  draft: ColumnDraft,
  types: ColumnTypeDef[],
): string {
  if (current.generated != null) return '';
  const nextName = draft.name.trim() || current.name;
  const nextType = formatColumnType(draft, types);
  const currentNullable = current.isNullable !== false;
  const typeChanged = !typesEqual(current.type, nextType);
  const nullChanged = currentNullable !== draft.nullable;
  const defaultChanged = (current.defaultValue?.trim() ?? '') !== draft.defaultValue.trim();
  const renamed = nextName !== current.name;
  // IDENTITY is part of the column and ALTER COLUMN cannot add or remove it.
  if (current.identity && (typeChanged || nullChanged || defaultChanged)) return '';
  const statements: string[] = [];
  const qualified = qualify(table.schema, table.name);
  if (renamed) statements.push(renameColumn(table.schema, table.name, current.name, nextName));
  const working = quoteIdent(nextName);
  if (current.defaultConstraint && (typeChanged || nullChanged || defaultChanged)) {
    statements.push(`ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(current.defaultConstraint)};`);
  }
  if (typeChanged || nullChanged) {
    const nullSql = draft.nullable ? 'NULL' : 'NOT NULL';
    statements.push(`ALTER TABLE ${qualified} ALTER COLUMN ${working} ${nextType} ${nullSql};`);
  }
  if (defaultChanged && draft.defaultValue.trim()) {
    const name = current.defaultConstraint || `df_${table.name}_${nextName}`;
    const expr = defaultExpr(draft.defaultValue);
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${quoteIdent(name)} DEFAULT ${expr} FOR ${working};`,
    );
  }
  const currentlyUnique = current.isUnique === true;
  if (currentlyUnique && !draft.unique) {
    const indexName = uniqueIndexName(table, current.name);
    if (indexName && !current.isPrimary) {
      statements.push(`DROP INDEX ${quoteIdent(indexName)} ON ${qualified};`);
    }
  }
  if (!currentlyUnique && draft.unique) {
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${quoteIdent(`${table.name}_${nextName}_key`)} UNIQUE (${working});`,
    );
  }
  if (draft.foreignKey && !fkEqual(current.foreignKey, draft.foreignKey)) {
    const existing = current.foreignKey?.name?.trim();
    if (existing) statements.push(`ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(existing)};`);
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${quoteIdent(existing || `${table.name}_${nextName}_fkey`)} FOREIGN KEY (${working})${referencesClause(draft.foreignKey)};`,
    );
  }
  return statements.join('\n');
}

export function buildDropColumnSql(table: TableRef, columnName: string): string {
  const qualified = qualify(table.schema, table.name);
  const full = table as TableSchema;
  const statements: string[] = [];
  const column = full.columns?.find((entry) => entry.name === columnName);
  if (column?.defaultConstraint) {
    statements.push(`ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(column.defaultConstraint)};`);
  }
  for (const index of full.indexes ?? []) {
    const covers =
      index.columns.includes(columnName) ||
      (index.includeColumns ?? []).includes(columnName) ||
      (index.keys ?? []).some((key) => !key.isExpression && key.expression === columnName);
    if (!covers) continue;
    if (index.isPrimary || index.constraint) {
      statements.push(
        `ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(index.constraint?.name || index.name)};`,
      );
    } else {
      statements.push(`DROP INDEX ${quoteIdent(index.name)} ON ${qualified};`);
    }
  }
  statements.push(`ALTER TABLE ${qualified} DROP COLUMN ${quoteIdent(columnName)};`);
  return statements.join('\n');
}

export function buildTruncateTableSql(table: TableRef): string {
  return `TRUNCATE TABLE ${qualify(table.schema, table.name)};`;
}

export function buildDropTableSql(table: TableRef): string {
  return `DROP TABLE ${qualify(table.schema, table.name)};`;
}

export function buildTableDdlPreview(table: TableSchema): string {
  const lines = table.columns.map((column) => {
    const bits = [`  ${quoteIdent(column.name)} ${column.type}`];
    if (column.identity) bits.push(`IDENTITY(${column.identity.seed}, ${column.identity.increment})`);
    if (column.isNullable === false) bits.push('NOT NULL');
    if (column.defaultValue?.trim()) bits.push(`DEFAULT ${column.defaultValue.trim()}`);
    return bits.join(' ');
  });
  const primary = table.columns.filter((column) => column.isPrimary).map((column) => quoteIdent(column.name));
  if (primary.length > 0) lines.push(`  PRIMARY KEY (${primary.join(', ')})`);
  return `CREATE TABLE ${qualify(table.schema, table.name)} (\n${lines.join(',\n')}\n);`;
}
