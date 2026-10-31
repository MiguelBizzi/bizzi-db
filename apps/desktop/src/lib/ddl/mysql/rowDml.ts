import type { DatabaseDialect, TableSchema } from '../../../types';
import { buildInsertSql, type InsertFieldState } from '../../insertRow';

/** MySQL row SQL. Quoting, `() VALUES ()`, and `X'..'` literals come from the dialect module. */
export function buildMysqlInsertSql(
  table: TableSchema,
  fields: Record<string, InsertFieldState>,
): string {
  return buildInsertSql(table, fields, 'MySQL' satisfies DatabaseDialect);
}
