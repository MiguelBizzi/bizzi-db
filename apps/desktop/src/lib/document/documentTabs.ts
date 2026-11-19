import type { Paradigm } from '@db/shared';
import type { CollectionSchema, TabType, WorkspaceTab } from '../../types';

export function newQueryTabType(paradigm: Paradigm): TabType {
  return paradigm === 'document' ? 'document_query' : 'sql_editor';
}

const isCollectionTab = (tab: WorkspaceTab, tableId: string, databaseId: string) =>
  tab.type === 'collection_documents' &&
  tab.tableId === tableId &&
  tab.databaseId === databaseId;

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

export function closableCollectionTabIds(
  tabs: WorkspaceTab[],
  collectionId: string,
  databaseId: string,
): string[] {
  return tabs.filter((tab) => isCollectionTab(tab, collectionId, databaseId)).map((tab) => tab.id);
}
