import { DIALECTS } from '@db/database';
import type {
  PendingCellUpdate,
  PendingModifications,
  PendingRowDelete,
  PendingRowInsert,
  TableSchema,
} from '../types';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export type PendingChangeKind = 'insert' | 'update' | 'delete';

export type PendingChangeRef =
  | { kind: 'insert'; tableId: string; tempId: string }
  | { kind: 'update'; tableId: string; rowId: string }
  | { kind: 'delete'; tableId: string; rowId: string };

export interface UpdateRowChange {
  rowId: string;
  primaryKeyValue: unknown;
  cells: PendingCellUpdate[];
}

export interface TablePendingBundle {
  tableId: string;
  table?: TableSchema;
  tableName: string;
  schema: string;
  inserts: PendingRowInsert[];
  updateRows: UpdateRowChange[];
  deletes: PendingRowDelete[];
}

export const emptyPending = (): PendingModifications => ({
  updates: [],
  inserts: [],
  deletes: [],
});

export function changeKey(ref: PendingChangeRef): string {
  if (ref.kind === 'insert') return `insert:${ref.tableId}:${ref.tempId}`;
  return `${ref.kind}:${ref.tableId}:${ref.rowId}`;
}

export function primaryKeyColumn(table?: TableSchema): string {
  return table?.columns.find((column) => column.isPrimary)?.name || 'id';
}

export function hasPending(mods: PendingModifications): boolean {
  return mods.updates.length + mods.inserts.length + mods.deletes.length > 0;
}

export function groupUpdateRows(updates: PendingCellUpdate[]): UpdateRowChange[] {
  const byRow = new Map<string, UpdateRowChange>();
  for (const cell of updates) {
    const rowId = String(cell.primaryKeyValue);
    const existing = byRow.get(rowId);
    if (existing) {
      existing.cells.push(cell);
    } else {
      byRow.set(rowId, {
        rowId,
        primaryKeyValue: cell.primaryKeyValue,
        cells: [cell],
      });
    }
  }
  return [...byRow.values()];
}

export function flattenPending(
  pendingByTable: Record<string, PendingModifications>,
  tables: TableSchema[]
): TablePendingBundle[] {
  const bundles: TablePendingBundle[] = [];
  for (const [tableId, mods] of Object.entries(pendingByTable)) {
    if (!hasPending(mods)) continue;
    const table = tables.find((candidate) => candidate.id === tableId);
    bundles.push({
      tableId,
      table,
      tableName: table?.name || tableId,
      schema: table?.schema || 'public',
      inserts: mods.inserts,
      updateRows: groupUpdateRows(mods.updates),
      deletes: mods.deletes,
    });
  }
  return bundles;
}

export function countPendingChanges(
  pendingByTable: Record<string, PendingModifications>
): number {
  return Object.values(pendingByTable).reduce((total, mods) => {
    return total + groupUpdateRows(mods.updates).length + mods.inserts.length + mods.deletes.length;
  }, 0);
}

export const SET_COLUMN_DEFAULT = Object.freeze({ __kind: 'columnDefault' as const });

export function isSetColumnDefault(value: unknown): boolean {
  return value === SET_COLUMN_DEFAULT;
}

export function formatCellValue(value: unknown): string {
  if (isSetColumnDefault(value)) return 'DEFAULT';
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function qualifyTable(schema: string, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

function sqlLiteral(value: unknown): string {
  if (isSetColumnDefault(value)) return 'DEFAULT';
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function qualifiedName(bundle: TablePendingBundle): string {
  return qualifyTable(bundle.schema, bundle.tableName);
}

export function sqlForInsert(bundle: TablePendingBundle, insert: PendingRowInsert): string {
  const entries = Object.entries(insert.data).filter(
    ([, value]) => value !== null && value !== undefined
  );
  if (entries.length === 0) {
    return `INSERT INTO ${qualifiedName(bundle)} DEFAULT VALUES;`;
  }
  const cols = entries.map(([column]) => quoteIdent(column)).join(', ');
  const vals = entries.map(([, value]) => sqlLiteral(value)).join(', ');
  return `INSERT INTO ${qualifiedName(bundle)} (${cols}) VALUES (${vals});`;
}

export function sqlForUpdateRow(bundle: TablePendingBundle, row: UpdateRowChange): string {
  const pk = primaryKeyColumn(bundle.table);
  const sets = row.cells
    .map((cell) => `${quoteIdent(cell.columnName)} = ${sqlLiteral(cell.newValue)}`)
    .join(', ');
  return `UPDATE ${qualifiedName(bundle)} SET ${sets} WHERE ${quoteIdent(pk)} = ${sqlLiteral(row.primaryKeyValue)};`;
}

export function sqlForDelete(bundle: TablePendingBundle, row: PendingRowDelete): string {
  const pk = primaryKeyColumn(bundle.table);
  return `DELETE FROM ${qualifiedName(bundle)} WHERE ${quoteIdent(pk)} = ${sqlLiteral(row.primaryKeyValue)};`;
}

export function sqlForChange(bundle: TablePendingBundle, ref: PendingChangeRef): string | null {
  if (ref.kind === 'insert') {
    const insert = bundle.inserts.find((row) => row.tempId === ref.tempId);
    return insert ? sqlForInsert(bundle, insert) : null;
  }
  if (ref.kind === 'update') {
    const row = bundle.updateRows.find((candidate) => candidate.rowId === ref.rowId);
    return row ? sqlForUpdateRow(bundle, row) : null;
  }
  const row = bundle.deletes.find((candidate) => String(candidate.primaryKeyValue) === ref.rowId);
  return row ? sqlForDelete(bundle, row) : null;
}

export function sqlForBundle(bundle: TablePendingBundle): string {
  const statements = [
    ...bundle.inserts.map((row) => sqlForInsert(bundle, row)),
    ...bundle.updateRows.map((row) => sqlForUpdateRow(bundle, row)),
    ...bundle.deletes.map((row) => sqlForDelete(bundle, row)),
  ];
  return statements.join('\n');
}

export function sqlForAll(bundles: TablePendingBundle[]): string {
  const body = bundles.map(sqlForBundle).filter(Boolean).join('\n');
  if (!body) return '';
  return `BEGIN;\n${body}\nCOMMIT;`;
}

export function removeChange(
  pending: PendingModifications,
  ref: PendingChangeRef
): PendingModifications {
  if (ref.kind === 'insert') {
    return { ...pending, inserts: pending.inserts.filter((row) => row.tempId !== ref.tempId) };
  }
  if (ref.kind === 'update') {
    return {
      ...pending,
      updates: pending.updates.filter((cell) => String(cell.primaryKeyValue) !== ref.rowId),
    };
  }
  return {
    ...pending,
    deletes: pending.deletes.filter((row) => String(row.primaryKeyValue) !== ref.rowId),
  };
}
