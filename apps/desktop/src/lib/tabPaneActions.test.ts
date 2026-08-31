import { describe, expect, test } from 'bun:test';
import type { WorkspaceTab } from '../types';
import {
  canClosePaneTabs,
  cloneTabForSplit,
  closePaneTabs,
  renameTab,
  tabIdsToClose,
} from './tabPaneActions';

function tab(id: string, extras: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id,
    type: 'sql_editor',
    title: extras.title ?? id,
    ...extras,
  };
}

const ids = ['a', 'b', 'c', 'd'];
const tabs = ids.map((id) => tab(id));

describe('tabIdsToClose', () => {
  test('close this returns only the target', () => {
    expect(tabIdsToClose(ids, 'c', tabs, 'this')).toEqual(['c']);
  });

  test('close others returns every tab except the target', () => {
    expect(tabIdsToClose(ids, 'b', tabs, 'others')).toEqual(['a', 'c', 'd']);
  });

  test('close left / right are relative to the target index', () => {
    expect(tabIdsToClose(ids, 'c', tabs, 'left')).toEqual(['a', 'b']);
    expect(tabIdsToClose(ids, 'c', tabs, 'right')).toEqual(['d']);
  });

  test('skips pinned tabs for every close kind', () => {
    const pinned = [tab('a', { isPinned: true }), tab('b'), tab('c', { isPinned: true }), tab('d')];
    expect(tabIdsToClose(ids, 'b', pinned, 'this')).toEqual(['b']);
    expect(tabIdsToClose(ids, 'a', pinned, 'this')).toEqual([]);
    expect(tabIdsToClose(ids, 'b', pinned, 'others')).toEqual(['d']);
    expect(tabIdsToClose(ids, 'd', pinned, 'left')).toEqual(['b']);
    expect(tabIdsToClose(ids, 'a', pinned, 'right')).toEqual(['b', 'd']);
  });

  test('returns empty when the target is not in the pane', () => {
    expect(tabIdsToClose(ids, 'missing', tabs, 'this')).toEqual([]);
    expect(tabIdsToClose(ids, 'missing', tabs, 'others')).toEqual([]);
  });
});

describe('canClosePaneTabs', () => {
  test('disables close-left with nothing to the left', () => {
    expect(canClosePaneTabs(ids, 'a', tabs, 'left')).toBe(false);
    expect(canClosePaneTabs(ids, 'b', tabs, 'left')).toBe(true);
  });

  test('disables close-right with nothing to the right', () => {
    expect(canClosePaneTabs(ids, 'd', tabs, 'right')).toBe(false);
    expect(canClosePaneTabs(ids, 'c', tabs, 'right')).toBe(true);
  });

  test('disables close-others with a single tab', () => {
    expect(canClosePaneTabs(['a'], 'a', [tab('a')], 'others')).toBe(false);
    expect(canClosePaneTabs(ids, 'a', tabs, 'others')).toBe(true);
  });

  test('disables close-this when the tab is pinned', () => {
    expect(canClosePaneTabs(ids, 'a', [tab('a', { isPinned: true }), tab('b'), tab('c'), tab('d')], 'this')).toBe(
      false
    );
  });

  test('disables close-others when every other tab is pinned', () => {
    const mixed = [tab('a', { isPinned: true }), tab('b'), tab('c', { isPinned: true })];
    expect(canClosePaneTabs(['a', 'b', 'c'], 'b', mixed, 'others')).toBe(false);
  });
});

describe('closePaneTabs', () => {
  test('removes closed tabs from the pane and the registry', () => {
    const result = closePaneTabs(tabs, ids, 'c', 'left');
    expect(result.tabIds).toEqual(['c', 'd']);
    expect(result.removedTabIds).toEqual(['a', 'b']);
    expect(result.tabs.map((t) => t.id)).toEqual(['c', 'd']);
  });

  test('is a no-op when nothing can close', () => {
    const result = closePaneTabs(tabs, ids, 'a', 'left');
    expect(result.tabIds).toEqual(ids);
    expect(result.removedTabIds).toEqual([]);
    expect(result.tabs).toBe(tabs);
  });
});

describe('cloneTabForSplit', () => {
  test('copies type, title, and content with a new id', () => {
    const source = tab('tab_sql_1', {
      title: 'Query 1',
      sqlContent: 'SELECT 1',
      databaseId: 'db1',
      tableId: 't1',
      tableName: 'users',
    });
    const clone = cloneTabForSplit(source, 'tab_sql_clone');
    expect(clone.id).toBe('tab_sql_clone');
    expect(clone.id).not.toBe(source.id);
    expect(clone.type).toBe(source.type);
    expect(clone.title).toBe(source.title);
    expect(clone.sqlContent).toBe('SELECT 1');
    expect(clone.databaseId).toBe('db1');
    expect(clone.tableId).toBe('t1');
    expect(clone.tableName).toBe('users');
    expect(clone.hasUncommittedChanges).toBeUndefined();
    expect(clone.isQueryRunning).toBeUndefined();
  });
});

describe('renameTab', () => {
  test('updates the matching tab title and trims whitespace', () => {
    const next = renameTab(tabs, 'b', '  Query B  ');
    expect(next.find((t) => t.id === 'b')?.title).toBe('Query B');
    expect(next.find((t) => t.id === 'a')?.title).toBe('a');
  });

  test('keeps the previous title when the new name is empty', () => {
    const next = renameTab(tabs, 'b', '   ');
    expect(next).toBe(tabs);
  });
});
