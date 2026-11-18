import type { CollectionSchema, WorkspaceTab } from '../../types';

const isCollectionTab = (tab: WorkspaceTab, tableId: string, databaseId?: string) =>
  tab.type === 'collection_documents' &&
  tab.tableId === tableId &&
  (databaseId === undefined || tab.databaseId === databaseId);

export function newCollectionTab(c: CollectionSchema, databaseId: string): WorkspaceTab {
  return {
    id: `tab_coll_${c.id}_${Date.now()}`,
    type: 'collection_documents',
    title: c.name,
    tableId: c.id,
    tableName: c.name,
    databaseId,
  };
}

export function openCollectionTab(
  tabs: WorkspaceTab[],
  c: CollectionSchema,
  databaseId: string,
): { tabs: WorkspaceTab[]; activeId: string } {
  const existing = tabs.find((tab) => isCollectionTab(tab, c.id, databaseId));
  if (existing) return { tabs, activeId: existing.id };
  const tab = newCollectionTab(c, databaseId);
  return { tabs: [...tabs, tab], activeId: tab.id };
}

export function closableCollectionTabIds(tabs: WorkspaceTab[], collectionId: string): string[] {
  return tabs.filter((tab) => isCollectionTab(tab, collectionId)).map((tab) => tab.id);
}
