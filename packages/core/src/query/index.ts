import { invoke } from '@tauri-apps/api/core';
import type { ExecuteQueryRequest, QueryExecutionResult, TablePreviewRequest } from '@db/shared';

export function queryExecute(input: ExecuteQueryRequest): Promise<QueryExecutionResult> {
  return invoke('query_execute', { input });
}

export function tablePreview(input: TablePreviewRequest): Promise<QueryExecutionResult> {
  return invoke('table_preview', { input });
}
