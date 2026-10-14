import type { WorkspaceState, WorkspaceTab } from '../types';

/**
 * The persisted workspace holds the tabs of every connection, each tagged with
 * its `databaseId`. Tabs saved before tagging existed have no `databaseId`;
 * they are adopted by whichever connection touches them first.
 */

const belongsTo = (tab: WorkspaceTab, connectionId: string) =>
  !tab.databaseId || tab.databaseId === connectionId;

const tag = (tab: WorkspaceTab, connectionId: string): WorkspaceTab =>
  tab.databaseId === connectionId ? tab : { ...tab, databaseId: connectionId };

function withoutKey(record: Record<string, string> | undefined, key: string) {
  const next = { ...(record ?? {}) };
  delete next[key];
  return next;
}

/** Writes one connection's live tabs into the full workspace, leaving the others untouched. */
export function mergeConnectionTabs(
  stored: WorkspaceState,
  connectionId: string,
  tabs: WorkspaceTab[],
  activeTabId: string | null
): WorkspaceState {
  const others = stored.tabs.filter((t) => !belongsTo(t, connectionId));
  const active = withoutKey(stored.activeTabByConnection, connectionId);
  if (activeTabId && tabs.some((t) => t.id === activeTabId)) {
    active[connectionId] = activeTabId;
  }
  return {
    ...stored,
    tabs: [...others, ...tabs.map((t) => tag(t, connectionId))],
    activeTabByConnection: active,
  };
}

/** The tabs to show when opening a connection, and which of them is active. */
export function restoreConnectionTabs(
  stored: WorkspaceState,
  connectionId: string
): { tabs: WorkspaceTab[]; activeTabId: string | null } {
  const tabs = stored.tabs.filter((t) => belongsTo(t, connectionId)).map((t) => tag(t, connectionId));
  const has = (id: string | null | undefined): id is string =>
    !!id && tabs.some((t) => t.id === id);
  const remembered = stored.activeTabByConnection?.[connectionId];
  const activeTabId = has(remembered)
    ? remembered
    : has(stored.activeTabId)
      ? stored.activeTabId
      : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

/** Forgets a deleted connection's tabs. */
export function dropConnectionTabs(
  stored: WorkspaceState,
  connectionId: string
): WorkspaceState {
  return {
    ...stored,
    tabs: stored.tabs.filter((t) => t.databaseId !== connectionId),
    activeTabByConnection: withoutKey(stored.activeTabByConnection, connectionId),
  };
}
