import type {
  IndexDefinition,
  ParameterMode,
  RoutineDefinition,
  RoutineKind,
  TableSchema,
} from '../../types';

export interface IndexKeyDraft {
  kind: 'column' | 'expression';
  /** Column name, or expression source (without wrapping parentheses). */
  value: string;
  descending: boolean;
  nulls: 'default' | 'first' | 'last';
  /** Raw operator class; empty for the type's default. */
  opclass: string;
  /** Raw collation; empty for the default. */
  collation: string;
}

export function emptyKeyDraft(column = ''): IndexKeyDraft {
  return { kind: 'column', value: column, descending: false, nulls: 'default', opclass: '', collation: '' };
}

export interface IndexDraft {
  name: string;
  /** Access method id, lower case. */
  method: string;
  unique: boolean;
  keys: IndexKeyDraft[];
  include: string[];
  /** Partial-index condition without `WHERE`; empty for a full index. */
  predicate: string;
  nullsNotDistinct: boolean;
  storageParams: { name: string; value: string }[];
  /** Empty for the database default. */
  tablespace: string;
  /** Build without blocking writes (not inside a transaction). */
  concurrently: boolean;
  ifNotExists: boolean;
  /** MySQL `INVISIBLE`. */
  invisible?: boolean;
  comment?: string;
}

export interface RoutineParameterDraft {
  mode: Exclude<ParameterMode, 'table'>;
  name: string;
  dataType: string;
  /** Default expression; empty for none. */
  default: string;
}

export function emptyParameterDraft(): RoutineParameterDraft {
  return { mode: 'in', name: '', dataType: '', default: '' };
}

export type ReturnDraft =
  | { kind: 'type'; type: string; setOf: boolean }
  | { kind: 'table'; columns: { name: string; dataType: string }[] };

export interface RoutineDraft {
  schema: string;
  name: string;
  kind: RoutineKind;
  /** Arguments; `RETURNS TABLE` columns live in `returns`. */
  parameters: RoutineParameterDraft[];
  /** Ignored for procedures. */
  returns: ReturnDraft;
  language: string;
  body: string;
  volatility: 'immutable' | 'stable' | 'volatile';
  strict: boolean;
  securityDefiner: boolean;
  /** Empty when the dialect has none. */
  parallel: '' | 'safe' | 'restricted' | 'unsafe';
  leakproof: boolean;
  /** Planner estimates; empty for the default. */
  cost: string;
  rows: string;
  comment: string;
  /** MySQL data-access characteristic. Omitted for Postgres. */
  dataAccess?: 'CONTAINS SQL' | 'NO SQL' | 'READS SQL DATA' | 'MODIFIES SQL DATA';
}

export interface ViewDraft {
  schema: string;
  name: string;
  /** Fixed once the view exists. */
  materialized: boolean;
  /** The SELECT. */
  definition: string;
  comment: string;
  /** Materialized views: populate on creation (otherwise WITH NO DATA). */
  withData: boolean;
  /** Plain views: drop and recreate instead of CREATE OR REPLACE. */
  recreate: boolean;
  /** MySQL `WITH CHECK OPTION`. */
  checkOption?: boolean;
  /** MySQL `SQL SECURITY`. Omitted means DEFINER, the server default. */
  sqlSecurity?: 'DEFINER' | 'INVOKER';
}

/**
 * What applying a change will run. `transactional` scripts are wrapped in one
 * transaction; others run statement by statement (e.g. CONCURRENTLY builds).
 */
export interface DdlPlan {
  ok: true;
  mode: 'none' | 'create' | 'alter' | 'replace' | 'recreate' | 'drop';
  statements: string[];
  transactional: boolean;
  warnings: string[];
}

/** The change can't be made this way; `reason` says why and what to do instead. */
export interface DdlRefusal {
  ok: false;
  reason: string;
}

export type DdlResult = DdlPlan | DdlRefusal;

export interface IndexContext {
  table: TableSchema;
  /** Every table of the database, for name collisions within the schema. */
  tables: TableSchema[];
  serverVersionNum?: number;
}

/** Index and routine DDL for one dialect. Every function is pure. */
export interface ObjectDdl {
  emptyIndexDraft(table: TableSchema): IndexDraft;
  indexDraftFrom(index: IndexDefinition): IndexDraft;
  suggestIndexName(draft: IndexDraft, ctx: IndexContext): string;
  validateIndex(draft: IndexDraft, ctx: IndexContext, original?: IndexDefinition): string[];
  createIndex(draft: IndexDraft, ctx: IndexContext): DdlResult;
  planIndexChange(original: IndexDefinition, draft: IndexDraft, ctx: IndexContext): DdlResult;
  dropIndex(index: IndexDefinition, table: TableSchema, opts: { concurrently: boolean }): DdlResult;

  emptyRoutineDraft(schema: string, kind: RoutineKind): RoutineDraft;
  routineDraftFrom(routine: RoutineDefinition, body: string): RoutineDraft;
  validateRoutine(draft: RoutineDraft): string[];
  createRoutine(draft: RoutineDraft): DdlResult;
  planRoutineChange(original: RoutineDefinition, body: string, draft: RoutineDraft): DdlResult;
  dropRoutine(routine: RoutineDefinition): DdlResult;

  emptyViewDraft(schema: string): ViewDraft;
  viewDraftFrom(view: TableSchema): ViewDraft;
  validateView(draft: ViewDraft): string[];
  createView(draft: ViewDraft): DdlResult;
  planViewChange(view: TableSchema, draft: ViewDraft): DdlResult;
  dropView(view: TableSchema): DdlResult;
}

export function planScript(plan: DdlPlan): string {
  if (plan.statements.length === 0) return '';
  const body = plan.statements.join('\n');
  return plan.transactional && plan.statements.length > 1 ? `BEGIN;\n${body}\nCOMMIT;` : body;
}
