import type { ConnectionFolder, ConnectionProfile } from '../types';

export type ConnectionFolderGroup = {
  folder: ConnectionFolder;
  profiles: ConnectionProfile[];
};

export type ConnectionTree = {
  ungrouped: ConnectionProfile[];
  folders: ConnectionFolderGroup[];
};

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

function byConnectionOrder(a: ConnectionProfile, b: ConnectionProfile): number {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  return byName(a, b);
}

export function groupConnections(
  folders: ConnectionFolder[],
  profiles: ConnectionProfile[]
): ConnectionTree {
  const grouped = new Map<string, ConnectionProfile[]>();
  for (const folder of folders) {
    grouped.set(folder.id, []);
  }

  const ungrouped: ConnectionProfile[] = [];
  for (const profile of profiles) {
    const folderId = profile.folderId;
    if (folderId && grouped.has(folderId)) {
      grouped.get(folderId)!.push(profile);
    } else {
      ungrouped.push(profile);
    }
  }

  ungrouped.sort(byConnectionOrder);
  const folderGroups = [...folders]
    .sort(byName)
    .map((folder) => ({
      folder,
      profiles: (grouped.get(folder.id) ?? []).sort(byConnectionOrder),
    }));

  return { ungrouped, folders: folderGroups };
}

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function connectionMatches(profile: ConnectionProfile, needle: string): boolean {
  return (
    matchesQuery(profile.name, needle) ||
    matchesQuery(profile.host, needle) ||
    matchesQuery(profile.database, needle) ||
    matchesQuery(profile.user, needle)
  );
}

export function filterConnectionTree(tree: ConnectionTree, query: string): ConnectionTree {
  const needle = query.trim().toLowerCase();
  if (!needle) return tree;

  const ungrouped = tree.ungrouped.filter((profile) => connectionMatches(profile, needle));
  const folders = tree.folders.flatMap((group) => {
    if (matchesQuery(group.folder.name, needle)) {
      return [group];
    }
    const profiles = group.profiles.filter((profile) => connectionMatches(profile, needle));
    return profiles.length > 0 ? [{ ...group, profiles }] : [];
  });

  return { ungrouped, folders };
}

export type ConnectionSwitcherEntry =
  | { kind: 'connection'; profile: ConnectionProfile }
  | {
      kind: 'folder';
      folder: ConnectionFolder;
      count: number;
      profiles: ConnectionProfile[];
    };

export function connectionSwitcherEntries(
  tree: ConnectionTree
): ConnectionSwitcherEntry[] {
  return [
    ...tree.ungrouped.map((profile) => ({ kind: 'connection' as const, profile })),
    ...tree.folders.map((group) => ({
      kind: 'folder' as const,
      folder: group.folder,
      count: group.profiles.length,
      profiles: group.profiles,
    })),
  ];
}

export function folderDeleteNeedsPrompt(count: number): boolean {
  return count > 0;
}

export function folderDeleteCopy(count: number) {
  const noun = count === 1 ? 'connection' : 'connections';
  return {
    keep: 'Keep connections',
    remove: 'Delete connections',
    confirmRemove: `Delete ${count} ${noun} in this folder?`,
  };
}

export function insertConnectionBefore(
  ids: string[],
  draggedId: string,
  beforeId: string | null
): string[] {
  const next = ids.filter((id) => id !== draggedId);
  if (!beforeId) {
    next.push(draggedId);
    return next;
  }
  const index = next.indexOf(beforeId);
  if (index < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(index, 0, draggedId);
  return next;
}

export function dropBeforeId(
  ids: string[],
  hoveredId: string,
  placeAfter: boolean,
  draggedId: string
): string | null {
  const without = ids.filter((id) => id !== draggedId);
  const index = without.indexOf(hoveredId);
  if (index < 0) return null;
  if (!placeAfter) return hoveredId;
  return without[index + 1] ?? null;
}

export type MeasuredConnection = {
  id: string;
  top: number;
  bottom: number;
};

export function dropTargetFromRects(
  folderId: string | null,
  items: MeasuredConnection[],
  y: number
): ConnectionDropTarget {
  for (const item of items) {
    const mid = (item.top + item.bottom) / 2;
    if (y < mid) {
      return { folderId, beforeId: item.id };
    }
  }
  return { folderId, beforeId: null };
}

export type ConnectionDropTarget = {
  folderId: string | null;
  beforeId: string | null;
};

export function isNoOpConnectionDrop(
  draggedId: string,
  currentFolderId: string | null | undefined,
  siblingIds: string[],
  target: ConnectionDropTarget
): boolean {
  if ((currentFolderId ?? null) !== target.folderId) return false;
  return insertConnectionBefore(siblingIds, draggedId, target.beforeId).join() === siblingIds.join();
}
