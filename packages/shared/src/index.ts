export type DatabaseDialect = 'PostgreSQL' | 'MySQL' | 'SQLite' | 'ClickHouse' | 'DuckDB';

export type Environment = 'production' | 'staging' | 'development';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export type SslMode = 'disabled' | 'require' | 'enabled';

export type SshAuthMethod = 'password' | 'privateKey';

export interface AppSettings {
  keychainEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  keychainEnabled: false,
};

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimary?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string | null;
  comment?: string;
  enumValues?: string[];
  foreignKey?: {
    targetTable: string;
    targetColumn: string;
    targetSchema?: string;
    onDelete?: string;
  };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  isUnique: boolean;
  type: string;
}

export interface TableSchema {
  id: string;
  name: string;
  schema: string;
  description?: string;
  rowCount: number;
  sizeMb: number;
  tags: string[];
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  createdAt: string;
  updatedAt: string;
  isView?: boolean;
  viewSql?: string;
}

export interface DatabaseSchema {
  id: string;
  name: string;
  dialect: DatabaseDialect;
  version: string;
  connectionHost: string;
  connectionPort: number;
  environment: Environment;
  status: ConnectionStatus;
  tables: TableSchema[];
  totalSizeMb: number;
  activeConnections: number;
  queriesPerSecond: number;
}

export type TabType =
  | 'table_data'
  | 'sql_editor'
  | 'erd_schema'
  | 'metrics'
  | 'activity_log'
  | 'schema_designer';

export interface WorkspaceTab {
  id: string;
  type: TabType;
  title: string;
  databaseId?: string;
  tableId?: string;
  tableName?: string;
  sqlContent?: string;
  sqlQuery?: string;
  isPinned?: boolean;
  hasUncommittedChanges?: boolean;
  isQueryRunning?: boolean;
}

export interface PendingCellUpdate {
  rowId: string | number;
  primaryKeyValue: unknown;
  columnName: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface PendingRowInsert {
  tempId: string;
  data: Record<string, unknown>;
}

export interface PendingRowDelete {
  rowId: string | number;
  primaryKeyValue: unknown;
  rowData: Record<string, unknown>;
}

export interface PendingModifications {
  updates: PendingCellUpdate[];
  inserts: PendingRowInsert[];
  deletes: PendingRowDelete[];
  tableAction?: 'truncate' | 'drop' | null;
}

export interface FilterClause {
  id: string;
  column: string;
  operator:
    | '='
    | '!='
    | '>'
    | '<'
    | '>='
    | '<='
    | 'LIKE'
    | 'ILIKE'
    | 'IS NULL'
    | 'IS NOT NULL'
    | 'IN';
  value: string;
  enabled: boolean;
}

export interface SortClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface ExplainPlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualStartupTimeMs?: number;
  actualTotalTimeMs?: number;
  actualRows?: number;
  filter?: string;
  indexName?: string;
  indexCond?: string;
  children?: ExplainPlanNode[];
}

export interface QueryExecutionResult {
  id: string;
  query: string;
  timestamp: string;
  executionTimeMs: number;
  affectedRows?: number;
  columns?: string[];
  rows?: Record<string, unknown>[];
  error?: string;
  /** Set when `rows` is one page of a larger result (see `ExecuteQueryRequest.pageSize`). */
  pageSize?: number;
  pageOffset?: number;
  /** Rows the whole query returns; only known when the page was counted. */
  totalRows?: number;
  explainPlan?: ExplainPlanNode;
}

export interface QueryExecuteResponse {
  results: QueryExecutionResult[];
}

export interface SavedQuery {
  id: string;
  title: string;
  description?: string;
  sql: string;
  databaseId: string;
  tags: string[];
  createdAt: string;
  isBookmarked: boolean;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  databaseName: string;
  query: string;
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'EXPLAIN' | 'SYSTEM';
  executionTimeMs: number;
  rowsAffected: number;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  user: string;
}

export interface ConnectionFolder {
  id: string;
  name: string;
}

export interface SaveFolderInput {
  id?: string;
  name: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  dialect: DatabaseDialect;
  host: string;
  port: number;
  database: string;
  user: string;
  sslMode: SslMode;
  poolSize: number;
  environment: Environment;
  status: ConnectionStatus;
  folderId?: string | null;
  sortOrder?: number;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuth: SshAuthMethod;
  sshKeyPath?: string | null;
}

export interface SaveConnectionInput {
  id?: string;
  name: string;
  dialect: DatabaseDialect;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslMode: SslMode;
  poolSize: number;
  environment: Environment;
  folderId?: string | null;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuth: SshAuthMethod;
  sshKeyPath?: string | null;
  sshPassword: string;
  sshPassphrase: string;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface TablePreviewRequest {
  connectionId: string;
  schema: string;
  table: string;
  limit: number;
  offset: number;
  /** Conditions the database applies; only matching rows are returned and counted. */
  filters?: Pick<FilterClause, 'column' | 'operator' | 'value'>[];
}

export interface ExecuteQueryRequest {
  connectionId: string;
  sql: string;
  recordHistory?: boolean;
  /** Pages single read-only statements; omitted, every row is returned. */
  pageSize?: number;
}

export interface QueryPageRequest {
  connectionId: string;
  sql: string;
  limit: number;
  offset: number;
  /** Also count the rows the query returns in all (one extra scan). */
  withCount?: boolean;
}

/** Half-open statement range in a script, in UTF-16 units (editor offsets). */
export interface SqlRange {
  start: number;
  end: number;
}

export interface SchemaSyncRequest {
  connectionId: string;
  lastFingerprint?: string | null;
  force?: boolean;
}

export interface SchemaSyncResponse {
  fingerprint: string;
  schema: DatabaseSchema | null;
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  currentConnectionId: string | null;
  /** Last active tab of each connection, so switching back restores it. */
  activeTabByConnection?: Record<string, string>;
}

export const DEFAULT_PREVIEW_LIMIT = 100;
