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

const { quoteIdent } = DIALECTS.MySQL;
const qualify = (schema: string, name: string) => qualifyTable(schema, name, quoteIdent);

function defaultSql(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'AUTO_INCREMENT') return undefined;
  return trimmed;
}

function columnDefinitionParts(draft: ColumnDraft, types: ColumnTypeDef[]): string[] {
  const parts = [`${quoteIdent(draft.name.trim())} ${formatColumnType(draft, types)}`];
  parts.push(draft.nullable ? 'NULL' : 'NOT NULL');
  if (draft.defaultValue.trim().toUpperCase() === 'AUTO_INCREMENT') {
    parts.push('AUTO_INCREMENT');
  } else {
    const fallback = defaultSql(draft.defaultValue);
    if (fallback) parts.push(`DEFAULT ${fallback}`);
  }
  if (draft.unique) parts.push('UNIQUE');
  const check = draft.checkExpression.trim();
  if (check) parts.push(`CHECK (${check})`);
  if (draft.foreignKey) parts.push(referencesClause(draft.foreignKey).trimStart());
  return parts;
}

function referencesClause(fk: ForeignKeyDraft): string {
  const target = qualify(fk.targetSchema, fk.targetTable);
  const onDelete = fk.onDelete.trim() ? ` ON DELETE ${fk.onDelete.trim()}` : '';
  return ` REFERENCES ${target} (${quoteIdent(fk.targetColumn)})${onDelete}`;
}

function constraintIdent(table: string, column: string, suffix: string): string {
  return quoteIdent(`${table}_${column}_${suffix}`);
}

export function buildAddColumnSql(table: TableRef, draft: ColumnDraft, types: ColumnTypeDef[]): string {
  const definition = columnDefinitionParts(draft, types).join(' ');
  return `ALTER TABLE ${qualify(table.schema, table.name)} ADD COLUMN ${definition};`;
}

export function buildCreateTableSql(
  table: TableRef,
  columns: NewTableColumn[],
  types: ColumnTypeDef[],
): string {
  const lines = columns.map((column) => `  ${columnDefinitionParts(column, types).join(' ')}`);
  const pk = columns.filter((column) => column.primaryKey).map((c) => quoteIdent(c.name.trim()));
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
  return `CREATE TABLE ${qualify(table.schema, table.name.trim())} (\n${lines.join(',\n')}\n) ENGINE=InnoDB;`;
}

function typesEqual(left: string, right: string): boolean {
  const a = parseTypeSql(left);
  const b = parseTypeSql(right);
  return a.base === b.base && a.length === b.length && a.precision === b.precision && a.scale === b.scale;
}

export function buildAlterColumnSql(
  table: TableSchema,
  current: ColumnDefinition,
  draft: ColumnDraft,
  types: ColumnTypeDef[],
): string {
  const nextName = draft.name.trim();
  const statements: string[] = [];
  const qualified = qualify(table.schema, table.name);
  if (nextName && nextName !== current.name) {
    statements.push(
      `ALTER TABLE ${qualified} RENAME COLUMN ${quoteIdent(current.name)} TO ${quoteIdent(nextName)};`,
    );
  }
  const nextType = formatColumnType(draft, types);
  const currentNullable = current.isNullable !== false;
  const currentDefault = current.defaultValue?.trim() ?? '';
  const nextDefault = draft.defaultValue.trim();
  const typeChanged = !typesEqual(current.type, nextType);
  const nullChanged = currentNullable !== draft.nullable;
  const defaultChanged = currentDefault !== nextDefault;
  if (typeChanged || nullChanged || defaultChanged) {
    const working = { ...draft, name: nextName || current.name };
    statements.push(
      `ALTER TABLE ${qualified} MODIFY COLUMN ${columnDefinitionParts(working, types).join(' ')};`,
    );
  }
  const currentlyUnique = current.isUnique === true;
  if (currentlyUnique && !draft.unique) {
    const indexName = uniqueIndexName(table, current.name);
    if (indexName && !current.isPrimary) {
      statements.push(`ALTER TABLE ${qualified} DROP INDEX ${quoteIdent(indexName)};`);
    }
  }
  if (!currentlyUnique && draft.unique) {
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${constraintIdent(table.name, nextName || current.name, 'key')} UNIQUE (${quoteIdent(nextName || current.name)});`,
    );
  }
  const check = draft.checkExpression.trim();
  if (check) {
    const name = constraintIdent(table.name, nextName || current.name, 'check');
    statements.push(`ALTER TABLE ${qualified} DROP CHECK ${name};`);
    statements.push(`ALTER TABLE ${qualified} ADD CONSTRAINT ${name} CHECK (${check});`);
  }
  if (draft.foreignKey) {
    const name = constraintIdent(table.name, nextName || current.name, 'fkey');
    statements.push(`ALTER TABLE ${qualified} DROP FOREIGN KEY ${name};`);
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${name} FOREIGN KEY (${quoteIdent(nextName || current.name)})${referencesClause(draft.foreignKey)};`,
    );
  }
  return statements.join('\n');
}

export function buildDropColumnSql(table: TableRef, columnName: string): string {
  return `ALTER TABLE ${qualify(table.schema, table.name)} DROP COLUMN ${quoteIdent(columnName)};`;
}

export function buildTruncateTableSql(table: TableRef): string {
  return `TRUNCATE TABLE ${qualify(table.schema, table.name)};`;
}

export function buildDropTableSql(table: TableRef): string {
  return `DROP TABLE ${qualify(table.schema, table.name)};`;
}

export function buildTableDdlPreview(table: TableSchema): string {
  const cols = table.columns
    .map((column) => {
      const bits = [`  ${quoteIdent(column.name)} ${column.type}`];
      if (column.isPrimary) bits.push('PRIMARY KEY');
      if (column.isNullable === false) bits.push('NOT NULL');
      if (column.defaultValue?.trim()) bits.push(`DEFAULT ${column.defaultValue}`);
      return bits.join(' ');
    })
    .join(',\n');
  return `CREATE TABLE ${qualify(table.schema, table.name)} (\n${cols}\n) ENGINE=InnoDB;`;
}
