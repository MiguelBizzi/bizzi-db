/**
 * Schema edits and deletes waiting in Pending Changes. Creating new objects
 * runs immediately; changing or removing existing ones is staged here and
 * reviewed alongside row changes.
 */

export type SchemaObjectKind = 'column' | 'index' | 'table' | 'view' | 'function' | 'procedure';

export type SchemaChangeAction = 'add' | 'alter' | 'replace' | 'recreate' | 'drop';

export interface SchemaChangeEffects {
  closeTableId?: string;
  closeRoutineId?: string;
  retargetRoutine?: { fromId: string; schema: string; name: string; preferredId?: string };
  retargetTable?: { fromId: string; toId: string };
}

export interface StagedSchemaChange {
  /** The object changed; staging the same key again replaces the earlier change. */
  key: string;
  /** The connection it was staged on; set by the app. */
  connectionId?: string;
  objectKind: SchemaObjectKind;
  action: SchemaChangeAction;
  schema: string;
  name: string;
  /** The table a column or index belongs to. */
  parent?: string;
  title: string;
  /** Statements without BEGIN/COMMIT. */
  sql: string;
  /** False for statements PostgreSQL refuses inside a transaction (CONCURRENTLY). */
  transactional: boolean;
  warnings: string[];
  effects?: SchemaChangeEffects;
}

export function stageSchemaChange(
  queue: StagedSchemaChange[],
  change: StagedSchemaChange
): StagedSchemaChange[] {
  const index = queue.findIndex((entry) => entry.key === change.key);
  if (index === -1) return [...queue, change];
  return queue.map((entry, i) => (i === index ? change : entry));
}

export function removeSchemaChange(queue: StagedSchemaChange[], key: string): StagedSchemaChange[] {
  return queue.filter((entry) => entry.key !== key);
}

function statementCount(sql: string): number {
  return sql.split(/;\s*(?:\n|$)/).filter((part) => part.trim()).length;
}

export function schemaChangeScript(change: StagedSchemaChange): string {
  const sql = change.sql.trim();
  return change.transactional && statementCount(sql) > 1 ? `BEGIN;\n${sql}\nCOMMIT;` : sql;
}

/**
 * Scripts for "Approve all", run in order: row changes and every
 * transactional schema change in one transaction, then each change that
 * can't run in a transaction on its own.
 */
export function applyAllScripts(rowStatements: string, queue: StagedSchemaChange[]): string[] {
  const inTransaction = [
    rowStatements.trim(),
    ...queue.filter((change) => change.transactional).map((change) => change.sql.trim()),
  ].filter(Boolean);
  const scripts = inTransaction.length > 0 ? [`BEGIN;\n${inTransaction.join('\n')}\nCOMMIT;`] : [];
  for (const change of queue) {
    if (!change.transactional) scripts.push(change.sql.trim());
  }
  return scripts;
}

export function stagedFromPlan(
  plan: { statements: string[]; transactional: boolean; warnings: string[] },
  meta: Omit<StagedSchemaChange, 'sql' | 'transactional' | 'warnings'>
): StagedSchemaChange {
  return {
    ...meta,
    sql: plan.statements.join('\n'),
    transactional: plan.transactional,
    warnings: plan.warnings,
  };
}

/** Staging keys: one staged change per object. */
export function columnChangeKey(table: { id: string }, column: string): string {
  return `column:${table.id}:${column}`;
}

export function columnAddKey(table: { id: string }, column: string): string {
  return `column-add:${table.id}:${column}`;
}

export function indexChangeKey(table: { schema: string }, index: string): string {
  return `index:${table.schema}.${index}`;
}

export function routineChangeKey(routine: { id: string }): string {
  return `routine:${routine.id}`;
}

export function viewChangeKey(view: { id: string }): string {
  return `view:${view.id}`;
}
