import { describe, expect, test } from 'bun:test';
import type { WorkspaceState, WorkspaceTab } from '../types';
import {
  dropConnectionTabs,
  mergeConnectionTabs,
  restoreConnectionTabs,
} from './connectionWorkspace';

const tab = (id: string, databaseId?: string): WorkspaceTab => ({
  id,
  type: 'sql_editor',
  title: id,
  databaseId,
  sqlContent: `select '${id}'`,
});

const state = (
  tabs: WorkspaceTab[],
  activeTabByConnection: Record<string, string> = {}
): WorkspaceState => ({
  tabs,
  activeTabId: null,
  currentConnectionId: null,
  activeTabByConnection,
});

describe('mergeConnectionTabs', () => {
  test('replaces only the given connection slice and keeps the rest', () => {
    const stored = state([tab('a1', 'A'), tab('b1', 'B')]);
    const next = mergeConnectionTabs(stored, 'A', [tab('a2', 'A')], 'a2');
    expect(next.tabs.map((t) => t.id).sort()).toEqual(['a2', 'b1']);
    expect(next.activeTabByConnection).toEqual({ A: 'a2' });
  });

  test('closing every tab of a connection clears its slice and active tab', () => {
    const stored = state([tab('a1', 'A'), tab('b1', 'B')], { A: 'a1', B: 'b1' });
    const next = mergeConnectionTabs(stored, 'A', [], null);
    expect(next.tabs.map((t) => t.id)).toEqual(['b1']);
    expect(next.activeTabByConnection).toEqual({ B: 'b1' });
  });

  test('tags untagged tabs with the connection', () => {
    const next = mergeConnectionTabs(state([]), 'A', [tab('x')], 'x');
    expect(next.tabs[0].databaseId).toBe('A');
  });

  test('absorbs legacy untagged stored tabs so they are not duplicated', () => {
    const stored = state([tab('legacy'), tab('b1', 'B')]);
    const next = mergeConnectionTabs(stored, 'A', [tab('legacy', 'A')], 'legacy');
    expect(next.tabs.map((t) => t.id).sort()).toEqual(['b1', 'legacy']);
  });
});

describe('restoreConnectionTabs', () => {
  test('returns only the connection tabs and its remembered active tab', () => {
    const stored = state([tab('a1', 'A'), tab('a2', 'A'), tab('b1', 'B')], { A: 'a2' });
    const restored = restoreConnectionTabs(stored, 'A');
    expect(restored.tabs.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(restored.activeTabId).toBe('a2');
  });

  test('falls back to the first tab when the remembered one is gone', () => {
    const stored = state([tab('a1', 'A')], { A: 'missing' });
    expect(restoreConnectionTabs(stored, 'A').activeTabId).toBe('a1');
  });

  test('falls back to the legacy global active tab', () => {
    const stored: WorkspaceState = {
      ...state([tab('a1', 'A'), tab('a2', 'A')]),
      activeTabId: 'a2',
    };
    expect(restoreConnectionTabs(stored, 'A').activeTabId).toBe('a2');
  });

  test('adopts untagged legacy tabs for the connection', () => {
    const restored = restoreConnectionTabs(state([tab('legacy')]), 'A');
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0].databaseId).toBe('A');
  });

  test('is empty with no active tab for an unknown connection', () => {
    const restored = restoreConnectionTabs(state([tab('a1', 'A')]), 'Z');
    expect(restored.tabs).toEqual([]);
    expect(restored.activeTabId).toBeNull();
  });

  test('A -> B -> C -> A keeps each workspace independent', () => {
    let stored = state([]);
    stored = mergeConnectionTabs(stored, 'A', [tab('a1', 'A'), tab('a2', 'A')], 'a1');
    stored = mergeConnectionTabs(stored, 'B', [tab('b1', 'B')], 'b1');
    stored = mergeConnectionTabs(stored, 'C', [tab('c1', 'C')], 'c1');
    const a = restoreConnectionTabs(stored, 'A');
    expect(a.tabs.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(a.activeTabId).toBe('a1');
    expect(restoreConnectionTabs(stored, 'B').tabs.map((t) => t.id)).toEqual(['b1']);
    expect(restoreConnectionTabs(stored, 'C').tabs.map((t) => t.id)).toEqual(['c1']);
  });
});

describe('dropConnectionTabs', () => {
  test('removes the connection tabs and its active entry', () => {
    const stored = state([tab('a1', 'A'), tab('b1', 'B')], { A: 'a1', B: 'b1' });
    const next = dropConnectionTabs(stored, 'A');
    expect(next.tabs.map((t) => t.id)).toEqual(['b1']);
    expect(next.activeTabByConnection).toEqual({ B: 'b1' });
  });
});
