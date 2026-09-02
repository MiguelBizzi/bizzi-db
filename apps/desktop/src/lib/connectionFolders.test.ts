import { describe, expect, test } from 'bun:test';
import type { ConnectionFolder, ConnectionProfile } from '../types';
import {
  connectionSwitcherEntries,
  dropBeforeId,
  dropTargetFromRects,
  filterConnectionTree,
  folderDeleteCopy,
  folderDeleteNeedsPrompt,
  groupConnections,
  insertConnectionBefore,
  isNoOpConnectionDrop,
} from './connectionFolders';

function folder(id: string, name: string): ConnectionFolder {
  return { id, name };
}

function profile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: 'conn_1',
    name: 'Local',
    dialect: 'PostgreSQL',
    host: '127.0.0.1',
    port: 5432,
    database: 'app',
    user: 'postgres',
    sslMode: 'disabled',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuth: 'password',
    sshKeyPath: null,
    poolSize: 8,
    environment: 'development',
    status: 'disconnected',
    ...overrides,
  };
}

describe('groupConnections', () => {
  test('puts folderless connections at the root and sorts folders by name', () => {
    const tree = groupConnections(
      [folder('folder_b', 'Staging'), folder('folder_a', 'Prod')],
      [
        profile({ id: 'c2', name: 'Beta', folderId: 'folder_b' }),
        profile({ id: 'c1', name: 'Alpha' }),
        profile({ id: 'c3', name: 'Gamma', folderId: 'folder_a' }),
        profile({ id: 'c4', name: 'Delta', folderId: null }),
      ]
    );

    expect(tree.ungrouped.map((item) => item.id)).toEqual(['c1', 'c4']);
    expect(tree.folders.map((group) => group.folder.name)).toEqual(['Prod', 'Staging']);
    expect(tree.folders[0].profiles.map((item) => item.id)).toEqual(['c3']);
    expect(tree.folders[1].profiles.map((item) => item.id)).toEqual(['c2']);
  });

  test('orders connections by sortOrder then name', () => {
    const tree = groupConnections(
      [folder('folder_a', 'Prod')],
      [
        profile({ id: 'c1', name: 'Alpha', sortOrder: 2 }),
        profile({ id: 'c2', name: 'Beta', sortOrder: 0 }),
        profile({ id: 'c3', name: 'Gamma', folderId: 'folder_a', sortOrder: 5 }),
        profile({ id: 'c4', name: 'Delta', folderId: 'folder_a', sortOrder: 1 }),
      ]
    );
    expect(tree.ungrouped.map((item) => item.id)).toEqual(['c2', 'c1']);
    expect(tree.folders[0].profiles.map((item) => item.id)).toEqual(['c4', 'c3']);
  });

  test('keeps empty folders and treats unknown folder ids as ungrouped', () => {
    const tree = groupConnections(
      [folder('folder_a', 'Empty')],
      [profile({ id: 'orphan', folderId: 'missing' })]
    );
    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0].profiles).toEqual([]);
    expect(tree.ungrouped.map((item) => item.id)).toEqual(['orphan']);
  });
});

describe('filterConnectionTree', () => {
  const tree = groupConnections(
    [folder('folder_a', 'Production'), folder('folder_b', 'QA')],
    [
      profile({ id: 'c1', name: 'Billing', host: 'bill.internal' }),
      profile({
        id: 'c2',
        name: 'Analytics',
        database: 'warehouse',
        folderId: 'folder_a',
      }),
      profile({
        id: 'c3',
        name: 'Legacy',
        user: 'archive',
        folderId: 'folder_a',
      }),
      profile({ id: 'c4', name: 'Sandbox', folderId: 'folder_b' }),
    ]
  );

  test('empty query is identity', () => {
    expect(filterConnectionTree(tree, '   ')).toEqual(tree);
  });

  test('matches connections inside folders by name, host, database, or user', () => {
    expect(filterConnectionTree(tree, 'ware').ungrouped).toEqual([]);
    expect(
      filterConnectionTree(tree, 'ware').folders.map((group) => ({
        id: group.folder.id,
        ids: group.profiles.map((item) => item.id),
      }))
    ).toEqual([{ id: 'folder_a', ids: ['c2'] }]);

    expect(
      filterConnectionTree(tree, 'bill').ungrouped.map((item) => item.id)
    ).toEqual(['c1']);
    expect(
      filterConnectionTree(tree, 'archive').folders[0].profiles.map((item) => item.id)
    ).toEqual(['c3']);
  });

  test('matching a folder name keeps that folder and all of its connections', () => {
    const filtered = filterConnectionTree(tree, 'prod');
    expect(filtered.ungrouped).toEqual([]);
    expect(filtered.folders).toHaveLength(1);
    expect(filtered.folders[0].folder.name).toBe('Production');
    expect(filtered.folders[0].profiles.map((item) => item.id)).toEqual(['c2', 'c3']);
  });
});

describe('connectionSwitcherEntries', () => {
  test('lists ungrouped connections then folders with counts', () => {
    const tree = groupConnections(
      [folder('folder_a', 'Prod')],
      [
        profile({ id: 'c1', name: 'Alpha' }),
        profile({ id: 'c2', name: 'Beta', folderId: 'folder_a' }),
        profile({ id: 'c3', name: 'Gamma', folderId: 'folder_a' }),
      ]
    );
    const entries = connectionSwitcherEntries(tree);
    expect(entries.map((entry) => entry.kind)).toEqual(['connection', 'folder']);
    expect(entries[0].kind === 'connection' && entries[0].profile.id).toBe('c1');
    expect(entries[1]).toMatchObject({
      kind: 'folder',
      count: 2,
      folder: { id: 'folder_a', name: 'Prod' },
    });
    if (entries[1].kind !== 'folder') throw new Error('expected folder');
    expect(entries[1].profiles.map((item) => item.id)).toEqual(['c2', 'c3']);
  });
});

describe('folderDeleteNeedsPrompt', () => {
  test('prompts only when the folder still has connections', () => {
    expect(folderDeleteNeedsPrompt(0)).toBe(false);
    expect(folderDeleteNeedsPrompt(2)).toBe(true);
  });
});

describe('insertConnectionBefore', () => {
  test('moves an id before a sibling or to the end', () => {
    expect(insertConnectionBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(insertConnectionBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
    expect(insertConnectionBefore(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });
});

describe('dropBeforeId', () => {
  test('maps hover edge onto the insertion marker', () => {
    expect(dropBeforeId(['a', 'b', 'c'], 'b', false, 'a')).toBe('b');
    expect(dropBeforeId(['a', 'b', 'c'], 'b', true, 'a')).toBe('c');
    expect(dropBeforeId(['a', 'b', 'c'], 'c', true, 'a')).toBeNull();
  });
});

describe('dropTargetFromRects', () => {
  const folderId = 'folder_a';
  const stacked = [
    { id: 'a', top: 0, bottom: 80 },
    { id: 'b', top: 88, bottom: 168 },
    { id: 'c', top: 176, bottom: 256 },
  ];

  test('inserts at the end of an empty list', () => {
    expect(dropTargetFromRects(folderId, [], 40)).toEqual({ folderId, beforeId: null });
  });

  test('inserts before the first card whose midpoint is below the pointer', () => {
    expect(dropTargetFromRects(null, stacked, 20)).toEqual({ folderId: null, beforeId: 'a' });
    expect(dropTargetFromRects(folderId, stacked, 100)).toEqual({ folderId, beforeId: 'b' });
    expect(dropTargetFromRects(folderId, stacked, 200)).toEqual({ folderId, beforeId: 'c' });
    expect(dropTargetFromRects(folderId, stacked, 240)).toEqual({ folderId, beforeId: null });
  });

  test('keeps the same slot when a placeholder has pushed the next card down', () => {
    const y = 100;
    const before = dropTargetFromRects(folderId, stacked, y);
    expect(before).toEqual({ folderId, beforeId: 'b' });

    const withGap = [
      stacked[0],
      { id: 'b', top: 88 + 80, bottom: 168 + 80 },
      { id: 'c', top: 176 + 80, bottom: 256 + 80 },
    ];
    expect(dropTargetFromRects(folderId, withGap, y)).toEqual(before);
  });
});

describe('isNoOpConnectionDrop', () => {
  test('ignores a drop that would leave the list unchanged', () => {
    expect(
      isNoOpConnectionDrop('b', 'folder_a', ['a', 'b', 'c'], {
        folderId: 'folder_a',
        beforeId: 'c',
      })
    ).toBe(true);
    expect(
      isNoOpConnectionDrop('b', 'folder_a', ['a', 'b', 'c'], {
        folderId: 'folder_a',
        beforeId: 'a',
      })
    ).toBe(false);
    expect(
      isNoOpConnectionDrop('b', 'folder_a', ['a', 'b', 'c'], {
        folderId: null,
        beforeId: null,
      })
    ).toBe(false);
  });
});
