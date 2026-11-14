import type { DatabaseSchema, WorkspaceTab } from '../types';

export type TabObjectKind = 'table' | 'view' | 'function' | 'procedure';

/** The sidebar object a tab shows, so both surfaces use the same icon. */
export function tabObjectKind(
  tab: WorkspaceTab,
  database: Pick<DatabaseSchema, "tables" | "routines"> | null | undefined,
): TabObjectKind | undefined {
  switch (tab.type) {
    case 'table_data': {
      const table = database?.tables.find((entry) => entry.id === tab.tableId);
      return table?.isView ? 'view' : 'table';
    }
    case 'view_designer':
      return 'view';
    case 'function_designer': {
      const routine = database?.routines?.find((entry) => entry.id === tab.routineId);
      return routine?.kind === 'procedure' ? 'procedure' : 'function';
    }
    default:
      return undefined;
  }
}
