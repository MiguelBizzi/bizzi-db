import type { WorkspaceTab } from '../types';

export type CloseTabKind = 'this' | 'others' | 'left' | 'right';

function isPinned(tabs: WorkspaceTab[], tabId: string): boolean {
  return tabs.find((tab) => tab.id === tabId)?.isPinned === true;
}

export function tabIdsToClose(
  tabIds: string[],
  targetTabId: string,
  tabs: WorkspaceTab[],
  kind: CloseTabKind
): string[] {
  const index = tabIds.indexOf(targetTabId);
  if (index < 0) return [];

  let candidates: string[];
  switch (kind) {
    case 'this':
      candidates = [targetTabId];
      break;
    case 'others':
      candidates = tabIds.filter((id) => id !== targetTabId);
      break;
    case 'left':
      candidates = tabIds.slice(0, index);
      break;
    case 'right':
      candidates = tabIds.slice(index + 1);
      break;
  }

  return candidates.filter((id) => !isPinned(tabs, id));
}

export function canClosePaneTabs(
  tabIds: string[],
  targetTabId: string,
  tabs: WorkspaceTab[],
  kind: CloseTabKind
): boolean {
  return tabIdsToClose(tabIds, targetTabId, tabs, kind).length > 0;
}

export function closePaneTabs(
  tabs: WorkspaceTab[],
  tabIds: string[],
  targetTabId: string,
  kind: CloseTabKind
): { tabs: WorkspaceTab[]; tabIds: string[]; removedTabIds: string[] } {
  const removedTabIds = tabIdsToClose(tabIds, targetTabId, tabs, kind);
  if (removedTabIds.length === 0) {
    return { tabs, tabIds, removedTabIds };
  }
  const removed = new Set(removedTabIds);
  return {
    tabs: tabs.filter((tab) => !removed.has(tab.id)),
    tabIds: tabIds.filter((id) => !removed.has(id)),
    removedTabIds,
  };
}

export function cloneTabForSplit(source: WorkspaceTab, id: string): WorkspaceTab {
  return {
    id,
    type: source.type,
    title: source.title,
    databaseId: source.databaseId,
    tableId: source.tableId,
    tableName: source.tableName,
    sqlContent: source.sqlContent,
    sqlQuery: source.sqlQuery,
  };
}

export function renameTab(
  tabs: WorkspaceTab[],
  tabId: string,
  title: string
): WorkspaceTab[] {
  const nextTitle = title.trim();
  if (!nextTitle) return tabs;
  let changed = false;
  const next = tabs.map((tab) => {
    if (tab.id !== tabId || tab.title === nextTitle) return tab;
    changed = true;
    return { ...tab, title: nextTitle };
  });
  return changed ? next : tabs;
}

export function newSplitTabId(source: WorkspaceTab): string {
  return `${source.id}_split_${Date.now()}`;
}
