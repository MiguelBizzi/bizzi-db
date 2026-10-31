import { invoke } from '@tauri-apps/api/core';
import type {
  ExecuteQueryRequest,
  QueryExecuteResponse,
  QueryExecutionResult,
  QueryPageRequest,
  SqlRange,
  TablePreviewRequest,
} from '@db/shared';

export function queryExecute(input: ExecuteQueryRequest): Promise<QueryExecuteResponse> {
  return invoke('query_execute', { input });
}

export function tablePreview(input: TablePreviewRequest): Promise<QueryExecutionResult> {
  return invoke('table_preview', { input });
}

export function queryPage(input: QueryPageRequest): Promise<QueryExecutionResult> {
  return invoke('query_page', { input });
}

export function sqlStatementRanges(sql: string, connectionId?: string): Promise<SqlRange[]> {
  return invoke('sql_statement_ranges', { sql, connectionId });
}
