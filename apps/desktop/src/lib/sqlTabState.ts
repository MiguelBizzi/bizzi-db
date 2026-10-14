import type { QueryExecutionResult } from '../types';

/** In-memory editor state that must survive switching away from a query tab. */
export interface SqlTabState {
  results: QueryExecutionResult[];
  activeResultIndex: number;
  /**
   * Data revision of each result's source table when it was fetched, so a tab
   * that was unmounted during an apply knows its rows are stale on return.
   */
  fetchedRevisions: Record<string, number>;
}

export const emptySqlTabState = (): SqlTabState => ({
  results: [],
  activeResultIndex: 0,
  fetchedRevisions: {},
});

/** Drops state belonging to tabs that no longer exist. */
export function pruneSqlTabState(
  state: Record<string, SqlTabState>,
  liveTabIds: Iterable<string>
): Record<string, SqlTabState> {
  const live = new Set(liveTabIds);
  const stale = Object.keys(state).filter((id) => !live.has(id));
  if (stale.length === 0) return state;
  const next = { ...state };
  for (const id of stale) delete next[id];
  return next;
}

/** Replaces one result in place, keeping its id so the grid is not remounted. */
export function replaceResult(
  results: QueryExecutionResult[],
  id: string,
  fresh: QueryExecutionResult
): QueryExecutionResult[] {
  return results.map((item) => (item.id === id ? { ...fresh, id } : item));
}

/** Result tabs to show: clamps a stored index after the result list shrinks. */
export function clampResultIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}
