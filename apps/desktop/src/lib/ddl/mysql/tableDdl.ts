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

const { quoteIdent, quoteLiteral } = DIALECTS.MySQL;
const qualify = (schema: string, name: string) => qualifyTable(schema, name, quoteIdent);

function defaultSql(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'AUTO_INCREMENT') return undefined;
  return trimmed;
}

// MySQL rejects CURRENT_TIMESTAMP(n) when n is not the column's fractional precision.
function alignTimestampPrecision(expression: string, fsp: number | null | undefined): string {
  if (fsp == null || !Number.isInteger(fsp)) return expression;
  return expression.replace(
    /\b(CURRENT_TIMESTAMP|LOCALTIMESTAMP|LOCALTIME|NOW)\s*\(\s*\d+\s*\)/gi,
    `$1(${fsp})`,
  );
}

function columnDefinitionParts(
  draft: ColumnDraft,
  types: ColumnTypeDef[],
  keep?: { forAlter?: boolean; comment?: string; onUpdate?: string },
): string[] {
  const typeSql = formatColumnType(draft, types);
  const temporal = /^(datetime|timestamp|time)\b/i.test(typeSql);
  const fsp = temporal ? draft.length : undefined;
  const parts = [`${quoteIdent(draft.name.trim())} ${typeSql}`];
  parts.push(draft.nullable ? 'NULL' : 'NOT NULL');
  if (draft.defaultValue.trim().toUpperCase() === 'AUTO_INCREMENT') {
    parts.push('AUTO_INCREMENT');
  } else {
    const fallback = defaultSql(alignTimestampPrecision(draft.defaultValue, fsp));
    if (fallback) parts.push(`DEFAULT ${fallback}`);
  }
  if (keep?.onUpdate?.trim()) {
    parts.push(`ON UPDATE ${alignTimestampPrecision(keep.onUpdate.trim(), fsp)}`);
  }
  if (!keep?.forAlter && draft.unique) parts.push('UNIQUE');
  const check = draft.checkExpression.trim();
  if (check && !keep?.forAlter) parts.push(`CHECK (${check})`);
  if (draft.foreignKey && !keep?.forAlter) {
    parts.push(referencesClause(draft.foreignKey).trimStart());
  }
  if (keep?.comment?.trim()) parts.push(`COMMENT ${quoteLiteral(keep.comment.trim())}`);
  return parts;
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
  if (current.generated != null) return '';
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
      `ALTER TABLE ${qualified} MODIFY COLUMN ${columnDefinitionParts(working, types, {
        forAlter: true,
        comment: current.comment,
        onUpdate: current.onUpdate,
      }).join(' ')};`,
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
    statements.push(`ALTER TABLE ${qualified} ADD CONSTRAINT ${name} CHECK (${check});`);
  }
  if (draft.foreignKey && !fkEqual(current.foreignKey, draft.foreignKey)) {
    const existing = current.foreignKey?.name?.trim();
    if (existing) {
      statements.push(`ALTER TABLE ${qualified} DROP FOREIGN KEY ${quoteIdent(existing)};`);
    }
    const constraint = existing
      ? quoteIdent(existing)
      : constraintIdent(table.name, nextName || current.name, 'fkey');
    statements.push(
      `ALTER TABLE ${qualified} ADD CONSTRAINT ${constraint} FOREIGN KEY (${quoteIdent(nextName || current.name)})${referencesClause(draft.foreignKey)};`,
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
  const lines = table.columns.map((column) => {
    const bits = [`  ${quoteIdent(column.name)} ${column.type}`];
    if (column.isNullable === false) bits.push('NOT NULL');
    const fallback = column.defaultValue?.trim() ?? '';
    if (fallback.toUpperCase() === 'AUTO_INCREMENT') bits.push('AUTO_INCREMENT');
    else if (fallback) bits.push(`DEFAULT ${fallback}`);
    if (column.onUpdate?.trim()) bits.push(`ON UPDATE ${column.onUpdate.trim()}`);
    return bits.join(' ');
  });
  const primary = table.columns.filter((column) => column.isPrimary).map((column) => quoteIdent(column.name));
  if (primary.length > 0) lines.push(`  PRIMARY KEY (${primary.join(', ')})`);
  return `CREATE TABLE ${qualify(table.schema, table.name)} (\n${lines.join(',\n')}\n) ENGINE=InnoDB;`;
}
