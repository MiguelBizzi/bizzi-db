import type {
  PendingCellUpdate,
  PendingModifications,
  PendingRowDelete,
  PendingRowInsert,
  TableSchema,
} from '../types';
import type { DatabaseDialect } from '../types';
import { tableDdlFor } from './ddl/registry';
import { ident, moduleFor, qualify, stringLiteral } from './dialectQuote';

export type PendingChangeKind = 'insert' | 'update' | 'delete' | 'truncate' | 'drop';

export type PendingChangeRef =
  | { kind: 'insert'; tableId: string; tempId: string }
  | { kind: 'update'; tableId: string; rowId: string }
  | { kind: 'delete'; tableId: string; rowId: string }
  | { kind: 'truncate'; tableId: string }
  | { kind: 'drop'; tableId: string };

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
  tableAction?: 'truncate' | 'drop' | null;
}

export const emptyPending = (): PendingModifications => ({
  updates: [],
  inserts: [],
  deletes: [],
  tableAction: null,
});

export function stageTableAction(
  _pending: PendingModifications,
  action: 'truncate' | 'drop'
): PendingModifications {
  return {
    updates: [],
    inserts: [],
    deletes: [],
    tableAction: action,
  };
}

export function changeKey(ref: PendingChangeRef): string {
  if (ref.kind === 'insert') return `insert:${ref.tableId}:${ref.tempId}`;
  if (ref.kind === 'truncate' || ref.kind === 'drop') return `${ref.kind}:${ref.tableId}`;
  return `${ref.kind}:${ref.tableId}:${ref.rowId}`;
}

/** A Pending Changes drawer confirmation that a menu command opens the drawer with, already armed. */
export type PendingConfirm = 'commit' | 'discard';

/** The confirmation the Commit / Discard Pending Changes menu commands arm; null for anything else. */
export function pendingConfirmForCommand(commandId: string): PendingConfirm | null {
  if (commandId === 'query.commit') return 'commit';
  if (commandId === 'query.discard') return 'discard';
  return null;
}

/** The drawer's armed key for a confirmation: its "Approve all" or "Cancel all" footer button. */
export function armedKeyForConfirm(confirm: PendingConfirm | null | undefined): string | null {
  if (confirm === 'commit') return 'approve-all';
  if (confirm === 'discard') return 'cancel-all';
  return null;
}

export function primaryKeyColumn(table?: TableSchema): string {
  return table?.columns.find((column) => column.isPrimary)?.name || 'id';
}

export function hasPending(mods: PendingModifications): boolean {
  return (
    mods.updates.length + mods.inserts.length + mods.deletes.length > 0 ||
    Boolean(mods.tableAction)
  );
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
  tables: TableSchema[],
  defaultSchema = 'public',
): TablePendingBundle[] {
  const bundles: TablePendingBundle[] = [];
  for (const [tableId, mods] of Object.entries(pendingByTable)) {
    if (!hasPending(mods)) continue;
    const table = tables.find((candidate) => candidate.id === tableId);
    bundles.push({
      tableId,
      table,
      tableName: table?.name || tableId,
      schema: table?.schema || defaultSchema,
      inserts: mods.inserts,
      updateRows: groupUpdateRows(mods.updates),
      deletes: mods.deletes,
      tableAction: mods.tableAction ?? null,
    });
  }
  return bundles;
}

export function countPendingChanges(
  pendingByTable: Record<string, PendingModifications>
): number {
  return Object.values(pendingByTable).reduce((total, mods) => {
    return (
      total +
      groupUpdateRows(mods.updates).length +
      mods.inserts.length +
      mods.deletes.length +
      (mods.tableAction ? 1 : 0)
    );
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

function sqlLiteral(dialect: DatabaseDialect, value: unknown): string {
  if (isSetColumnDefault(value)) return 'DEFAULT';
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return moduleFor(dialect).booleanLiteral(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return stringLiteral(dialect, String(value));
}

function qualifiedName(dialect: DatabaseDialect, bundle: TablePendingBundle): string {
  return qualify(dialect, bundle.schema, bundle.tableName);
}

export function sqlForInsert(
  bundle: TablePendingBundle,
  insert: PendingRowInsert,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  const entries = Object.entries(insert.data).filter(
    ([, value]) => value !== null && value !== undefined
  );
  const qualified = qualifiedName(dialect, bundle);
  if (entries.length === 0) {
    return `INSERT INTO ${qualified} ${moduleFor(dialect).emptyInsert};`;
  }
  const cols = entries.map(([column]) => ident(dialect, column)).join(', ');
  const vals = entries.map(([, value]) => sqlLiteral(dialect, value)).join(', ');
  return `INSERT INTO ${qualified} (${cols}) VALUES (${vals});`;
}

export function sqlForUpdateRow(
  bundle: TablePendingBundle,
  row: UpdateRowChange,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  const pk = primaryKeyColumn(bundle.table);
  const sets = row.cells
    .map((cell) => `${ident(dialect, cell.columnName)} = ${sqlLiteral(dialect, cell.newValue)}`)
    .join(', ');
  return `UPDATE ${qualifiedName(dialect, bundle)} SET ${sets} WHERE ${ident(dialect, pk)} = ${sqlLiteral(dialect, row.primaryKeyValue)};`;
}

export function sqlForDelete(
  bundle: TablePendingBundle,
  row: PendingRowDelete,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  const pk = primaryKeyColumn(bundle.table);
  return `DELETE FROM ${qualifiedName(dialect, bundle)} WHERE ${ident(dialect, pk)} = ${sqlLiteral(dialect, row.primaryKeyValue)};`;
}

function tableActionSql(
  dialect: DatabaseDialect,
  bundle: TablePendingBundle,
  kind: 'truncate' | 'drop',
): string {
  const ddl = tableDdlFor(dialect);
  const table = { schema: bundle.schema, name: bundle.tableName };
  if (!ddl) return '';
  return kind === 'truncate' ? ddl.buildTruncateTableSql(table) : ddl.buildDropTableSql(table);
}

export function sqlForChange(
  bundle: TablePendingBundle,
  ref: PendingChangeRef,
  dialect: DatabaseDialect = 'PostgreSQL',
): string | null {
  if (ref.kind === 'insert') {
    const insert = bundle.inserts.find((row) => row.tempId === ref.tempId);
    return insert ? sqlForInsert(bundle, insert, dialect) : null;
  }
  if (ref.kind === 'update') {
    const row = bundle.updateRows.find((candidate) => candidate.rowId === ref.rowId);
    return row ? sqlForUpdateRow(bundle, row, dialect) : null;
  }
  if (ref.kind === 'truncate' || ref.kind === 'drop') {
    if (bundle.tableAction !== ref.kind) return null;
    return tableActionSql(dialect, bundle, ref.kind);
  }
  const row = bundle.deletes.find((candidate) => String(candidate.primaryKeyValue) === ref.rowId);
  return row ? sqlForDelete(bundle, row, dialect) : null;
}

export function sqlForBundle(
  bundle: TablePendingBundle,
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  const statements = [
    ...bundle.inserts.map((row) => sqlForInsert(bundle, row, dialect)),
    ...bundle.updateRows.map((row) => sqlForUpdateRow(bundle, row, dialect)),
    ...bundle.deletes.map((row) => sqlForDelete(bundle, row, dialect)),
  ];
  if (bundle.tableAction === 'truncate' || bundle.tableAction === 'drop') {
    statements.push(tableActionSql(dialect, bundle, bundle.tableAction));
  }
  return statements.join('\n');
}

export function rowStatementsForAll(
  bundles: TablePendingBundle[],
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  return bundles.map((bundle) => sqlForBundle(bundle, dialect)).filter(Boolean).join('\n');
}

export function sqlForAll(
  bundles: TablePendingBundle[],
  dialect: DatabaseDialect = 'PostgreSQL',
): string {
  const body = rowStatementsForAll(bundles, dialect);
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
  if (ref.kind === 'truncate' || ref.kind === 'drop') {
    return { ...pending, tableAction: null };
  }
  return {
    ...pending,
    deletes: pending.deletes.filter((row) => String(row.primaryKeyValue) !== ref.rowId),
  };
}
