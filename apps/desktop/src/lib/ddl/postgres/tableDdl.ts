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

const { quoteIdent } = DIALECTS.PostgreSQL;
const qualify = (schema: string, name: string) => qualifyTable(schema, name, quoteIdent);

function defaultSql(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function referencesClause(fk: ForeignKeyDraft): string {
  const target = qualify(fk.targetSchema, fk.targetTable);
  const onDelete = fk.onDelete.trim() ? ` ON DELETE ${fk.onDelete.trim()}` : '';
  return ` REFERENCES ${target} (${quoteIdent(fk.targetColumn)})${onDelete}`;
}

function columnDefinitionParts(draft: ColumnDraft, types: ColumnTypeDef[]): string[] {
  const parts = [`${quoteIdent(draft.name.trim())} ${formatColumnType(draft, types)}`];
  if (!draft.nullable) parts.push('NOT NULL');
  const fallback = defaultSql(draft.defaultValue);
  if (fallback) parts.push(`DEFAULT ${fallback}`);
  if (draft.unique) parts.push('UNIQUE');
  const check = draft.checkExpression.trim();
  if (check) parts.push(`CHECK (${check})`);
  if (draft.foreignKey) parts.push(referencesClause(draft.foreignKey).trimStart());
  return parts;
}

export function buildAddColumnSql(
  table: TableRef,
  draft: ColumnDraft,
  types: ColumnTypeDef[]
): string {
  const definition = columnDefinitionParts(draft, types).join(' ');
  return `ALTER TABLE ${qualify(table.schema, table.name)} ADD COLUMN ${definition};`;
}

export function buildCreateTableSql(
  table: TableRef,
  columns: NewTableColumn[],
  types: ColumnTypeDef[]
): string {
  const lines = columns.map((column) => `  ${columnDefinitionParts(column, types).join(' ')}`);
  const pk = columns.filter((column) => column.primaryKey).map((c) => quoteIdent(c.name.trim()));
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
  return `CREATE TABLE ${qualify(table.schema, table.name.trim())} (\n${lines.join(',\n')}\n);`;
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
  const qualified = qualify(table.schema, table.name);

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
  return `ALTER TABLE ${qualify(table.schema, table.name)} DROP COLUMN ${quoteIdent(columnName)};`;
}

export function buildTruncateTableSql(table: TableRef): string {
  return `TRUNCATE TABLE ${qualify(table.schema, table.name)};`;
}

export function buildDropTableSql(table: TableRef): string {
  return `DROP TABLE ${qualify(table.schema, table.name)};`;
}

export function buildTableDdlPreview(table: TableSchema): string {
  const quote = quoteIdent;
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
      if (index.definition) return `${index.definition};`;
      const unique = index.isUnique ? 'UNIQUE ' : '';
      const colsSql = index.columns.map((name) => quote(name)).join(', ');
      return `CREATE ${unique}INDEX ${quote(index.name)} ON ${qualify(table.schema, table.name)} USING ${index.type} (${colsSql});`;
    })
    .join('\n');
  const header = `-- Table DDL for ${table.schema}.${table.name}\nCREATE TABLE ${qualify(table.schema, table.name)} (\n${cols}\n);`;
  return indexes ? `${header}\n\n${indexes}` : header;
}
