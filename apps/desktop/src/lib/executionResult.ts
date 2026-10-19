import type { QueryExecutionResult } from '../types';

/**
 * A script stops at its first failing statement, which need not be the first
 * one (`BEGIN; …` succeeds before the real work fails).
 */
export function firstExecutionError(results: QueryExecutionResult[]): string | undefined {
  return results.find((result) => result.error)?.error;
}
