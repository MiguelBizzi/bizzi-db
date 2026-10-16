import { describe, expect, test } from 'bun:test';
import type { WorkspaceTab } from '../types';
import { popReopenable, pushClosed, type ClosedTab } from './closedTabs';

function closed(id: string, extras: Partial<WorkspaceTab> = {}): ClosedTab {
  return {
    tab: { id, type: 'sql_editor', title: id, ...extras },
    paneId: 'pane-1',
    index: 0,
  };
}

const ids = (stack: ClosedTab[]) => stack.map((entry) => entry.tab.id);

describe('pushClosed', () => {
  test('appends entries newest last', () => {
    const result = pushClosed([closed('a')], [closed('b'), closed('c')]);
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  test('keeps 20 and drops the oldest by default', () => {
    const stack = Array.from({ length: 20 }, (_, i) => closed(`t${i}`));
    const result = pushClosed(stack, [closed('new')]);
    expect(result).toHaveLength(20);
    expect(result[0].tab.id).toBe('t1');
    expect(result[19].tab.id).toBe('new');
  });

  test('honours a max smaller than the stack', () => {
    const stack = [closed('a'), closed('b'), closed('c')];
    const result = pushClosed(stack, [closed('d')], 2);
    expect(ids(result)).toEqual(['c', 'd']);
  });

  test('does not mutate its inputs', () => {
    const stack = Object.freeze([closed('a')]) as ClosedTab[];
    const entries = Object.freeze([closed('b')]) as ClosedTab[];
    const result = pushClosed(stack, entries);
    expect(result).not.toBe(stack);
    expect(ids(stack)).toEqual(['a']);
    expect(ids(entries)).toEqual(['b']);
  });
});

describe('popReopenable', () => {
  test('returns the newest valid entry', () => {
    const result = popReopenable([closed('a'), closed('b')], () => true);
    expect(result?.entry.tab.id).toBe('b');
    expect(ids(result!.rest)).toEqual(['a']);
  });

  test('discards invalid entries above the valid one', () => {
    const stack = [
      closed('a'),
      closed('b'),
      closed('gone-table', { type: 'table', tableId: 'missing' }),
    ];
    const result = popReopenable(stack, (tab) => tab.tableId !== 'missing');
    expect(result?.entry.tab.id).toBe('b');
    expect(ids(result!.rest)).toEqual(['a']);
  });

  test('keeps older invalid entries below the returned one', () => {
    const stack = [closed('bad'), closed('good')];
    const result = popReopenable(stack, (tab) => tab.id !== 'bad');
    expect(result?.entry.tab.id).toBe('good');
    expect(ids(result!.rest)).toEqual(['bad']);
  });

  test('returns null for an empty stack', () => {
    expect(popReopenable([], () => true)).toBeNull();
  });

  test('returns null when every entry is invalid', () => {
    expect(popReopenable([closed('a'), closed('b')], () => false)).toBeNull();
  });

  test('does not mutate the input', () => {
    const stack = Object.freeze([closed('a'), closed('b')]) as ClosedTab[];
    popReopenable(stack, (tab) => tab.id === 'a');
    expect(ids(stack)).toEqual(['a', 'b']);
  });
});
