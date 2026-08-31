export type DatabaseDialect = 'PostgreSQL' | 'MySQL' | 'SQLite' | 'ClickHouse' | 'DuckDB';

export type Environment = 'production' | 'staging' | 'development';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

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
  truncated?: boolean;
  explainPlan?: ExplainPlanNode;
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

export interface ConnectionProfile {
  id: string;
  name: string;
  dialect: DatabaseDialect;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  poolSize: number;
  environment: Environment;
  status: ConnectionStatus;
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
  ssl: boolean;
  poolSize: number;
  environment: Environment;
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
}

export interface ExecuteQueryRequest {
  connectionId: string;
  sql: string;
  recordHistory?: boolean;
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  currentConnectionId: string | null;
}

export const DEFAULT_ROW_CAP = 1000;
export const DEFAULT_PREVIEW_LIMIT = 100;
