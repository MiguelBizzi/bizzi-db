import type { DatabaseSchema, WorkspaceTab } from '../types';

export type TabObjectKind =
  | 'table'
  | 'view'
  | 'function'
  | 'procedure'
  | 'collection'
  | 'timeseries';

/** The sidebar object a tab shows, so both surfaces use the same icon. */
export function tabObjectKind(
  tab: WorkspaceTab,
  database: Pick<DatabaseSchema, "tables" | "routines" | "collections"> | null | undefined,
): TabObjectKind | undefined {
  switch (tab.type) {
    case 'table_data': {
      const table = database?.tables.find((entry) => entry.id === tab.tableId);
      return table?.isView ? 'view' : 'table';
    }
    case 'collection_documents': {
      const kind = database?.collections?.find((entry) => entry.id === tab.tableId)?.kind;
      return kind === 'view' ? 'view' : kind === 'timeseries' ? 'timeseries' : 'collection';
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
