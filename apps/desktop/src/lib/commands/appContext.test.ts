import { describe, expect, test } from 'bun:test';
import type { WorkspaceTab } from '../../types';
import { deriveCommandContext } from './appContext';
import { EMPTY_CONTEXT } from './context';

const tab = (id: string, type: WorkspaceTab['type']): WorkspaceTab => ({ id, type, title: id });

const base = {
  tabs: [tab('a', 'sql_editor'), tab('b', 'table_data')],
  activeTabId: 'b',
  currentDbId: 'db1',
  pendingCount: 0,
  paneTabCount: 2,
  closedTabCount: 0,
  modals: {},
};

describe('deriveCommandContext', () => {
  test('maps app state onto the command context', () => {
    expect(deriveCommandContext({ ...base, pendingCount: 3, paneTabCount: 1, closedTabCount: 4 })).toEqual({
      ...EMPTY_CONTEXT,
      activeTabType: 'table_data',
      tabCount: 2,
      paneTabCount: 1,
      closedTabCount: 4,
      pendingCount: 3,
      connectionOpen: true,
      modalOpen: false,
    });
  });

  test('activeTabType is null when no tab is active', () => {
    expect(deriveCommandContext({ ...base, activeTabId: '' }).activeTabType).toBeNull();
    expect(deriveCommandContext({ ...base, activeTabId: 'missing' }).activeTabType).toBeNull();
    expect(deriveCommandContext({ ...base, tabs: [], activeTabId: '' }).tabCount).toBe(0);
  });

  test('passes paneTabCount and closedTabCount through unchanged', () => {
    expect(deriveCommandContext({ ...base, paneTabCount: 0 }).paneTabCount).toBe(0);
    expect(deriveCommandContext({ ...base, paneTabCount: 5 }).paneTabCount).toBe(5);
    expect(deriveCommandContext({ ...base, closedTabCount: 0 }).closedTabCount).toBe(0);
    expect(deriveCommandContext({ ...base, closedTabCount: 7 }).closedTabCount).toBe(7);
  });

  test('connectionOpen follows currentDbId', () => {
    expect(deriveCommandContext({ ...base, currentDbId: null }).connectionOpen).toBe(false);
    expect(deriveCommandContext({ ...base, currentDbId: 'x' }).connectionOpen).toBe(true);
  });

  test('modalOpen is true when any modal flag is true', () => {
    expect(deriveCommandContext({ ...base, modals: { palette: false, settings: false } }).modalOpen).toBe(false);
    expect(deriveCommandContext({ ...base, modals: { palette: false, settings: true } }).modalOpen).toBe(true);
    expect(deriveCommandContext({ ...base, modals: { confirm: true } }).modalOpen).toBe(true);
  });
});
