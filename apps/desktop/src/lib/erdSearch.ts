import type { TableSchema } from '../types';

export type ErdSearchHits = {
  tableIds: string[];
  columnKeys: string[];
};

export function columnKey(tableId: string, columnName: string): string {
  return `${tableId}:${columnName}`;
}

export function searchErd(tables: TableSchema[], query: string): ErdSearchHits {
  const needle = query.trim().toLowerCase();
  if (!needle) return { tableIds: [], columnKeys: [] };

  const tableIds: string[] = [];
  const columnKeys: string[] = [];

  for (const table of tables) {
    const tableHit =
      table.name.toLowerCase().includes(needle) ||
      table.schema.toLowerCase().includes(needle);
    let columnHit = false;
    for (const column of table.columns) {
      if (column.name.toLowerCase().includes(needle)) {
        columnKeys.push(columnKey(table.id, column.name));
        columnHit = true;
      }
    }
    if (tableHit || columnHit) tableIds.push(table.id);
  }

  return { tableIds, columnKeys };
}
