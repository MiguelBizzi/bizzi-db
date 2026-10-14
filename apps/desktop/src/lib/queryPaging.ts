import type { QueryExecutionResult } from '../types';

/** Rows per page for a freshly run query; the grid's footer can change it. */
export const QUERY_PAGE_SIZE = 100;

/** Offset of the last page of `total` rows, for when the page asked for no longer exists. */
export function lastPageOffset(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.floor((total - 1) / pageSize) * pageSize;
}

/**
 * Rows a result reports in all. A page that was not counted falls back to what
 * is known: everything up to and including the loaded page.
 */
export function resultTotalRows(result: Pick<QueryExecutionResult, 'rows' | 'pageOffset' | 'totalRows'>): number {
  if (result.totalRows !== undefined) return result.totalRows;
  return (result.pageOffset ?? 0) + (result.rows?.length ?? 0);
}

/** A page fetched without a count keeps the total the result already had. */
export function mergePageResult(
  previous: Pick<QueryExecutionResult, 'totalRows'>,
  fresh: QueryExecutionResult
): QueryExecutionResult {
  if (fresh.error || fresh.pageSize === undefined || fresh.totalRows !== undefined) return fresh;
  if (previous.totalRows === undefined) return fresh;
  return { ...fresh, totalRows: previous.totalRows, affectedRows: previous.totalRows };
}

/** True when the loaded rows are only part of what the query returns. */
export function hasUnloadedRows(result: QueryExecutionResult): boolean {
  if (result.pageSize === undefined) return false;
  if (result.totalRows === undefined) return true;
  return result.totalRows > (result.rows?.length ?? 0);
}
