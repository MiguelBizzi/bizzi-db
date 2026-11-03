import type { TableSchema } from '../../../types';
import { qualify } from '../../dialectQuote';
import { buildInsertSql, type InsertFieldState } from '../../insertRow';

export function buildSqlServerInsertSql(
  table: TableSchema,
  fields: Record<string, InsertFieldState>,
): string {
  const sql = buildInsertSql(table, fields, 'SQLServer');
  const explicit = table.columns.some((column) => {
    if (!column.identity) return false;
    const field = fields[column.name];
    return field != null && field.mode !== 'default';
  });
  if (!explicit) return sql;
  const qualified = qualify('SQLServer', table.schema, table.name);
  return `SET IDENTITY_INSERT ${qualified} ON;\n${sql}\nSET IDENTITY_INSERT ${qualified} OFF;`;
}
