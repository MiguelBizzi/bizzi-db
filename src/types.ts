export type DatabaseDialect = 'PostgreSQL' | 'MySQL' | 'SQLite' | 'ClickHouse' | 'DuckDB';

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimary?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string | null;
  comment?: string;
  foreignKey?: {
    targetTable: string;
    targetColumn: string;
    onDelete?: string;
  };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  isUnique: boolean;
  type: string; // e.g. 'BTREE', 'HASH', 'GIN'
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
  environment: 'production' | 'staging' | 'development';
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tables: TableSchema[];
  totalSizeMb: number;
  activeConnections: number;
  queriesPerSecond: number;
}

export type TabType = 'table_data' | 'sql_editor' | 'erd_schema' | 'metrics' | 'activity_log' | 'schema_designer' | 'ai_chat';

export interface WorkspaceTab {
  id: string;
  type: TabType;
  title: string;
  databaseId?: string;
  tableId?: string;
  tableName?: string; // For table_data or schema_designer
  sqlContent?: string;
  sqlQuery?: string; // For sql_editor
  isPinned?: boolean;
  hasUncommittedChanges?: boolean;
  isQueryRunning?: boolean;
}

// Data Editing & Uncommitted Changes
export interface PendingCellUpdate {
  rowId: string | number;
  primaryKeyValue: any;
  columnName: string;
  oldValue: any;
  newValue: any;
}

export interface PendingRowInsert {
  tempId: string;
  data: Record<string, any>;
}

export interface PendingRowDelete {
  rowId: string | number;
  primaryKeyValue: any;
  rowData: Record<string, any>;
}

export interface PendingModifications {
  updates: PendingCellUpdate[];
  inserts: PendingRowInsert[];
  deletes: PendingRowDelete[];
}

// Data Filter & Sort
export interface FilterClause {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IS NULL' | 'IS NOT NULL' | 'IN';
  value: string;
  enabled: boolean;
}

export interface SortClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

// SQL Query Execution
export interface QueryExecutionResult {
  id: string;
  query: string;
  timestamp: string;
  executionTimeMs: number;
  affectedRows?: number;
  columns?: string[];
  rows?: Record<string, any>[];
  error?: string;
  explainPlan?: ExplainPlanNode;
}

export interface ExplainPlanNode {
  nodeType: string; // e.g. 'Index Scan', 'Seq Scan', 'Hash Join', 'Nested Loop', 'Aggregate'
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
  environment: 'production' | 'staging' | 'development';
}
