import { describe, expect, test } from 'bun:test';
import {
  addTabToPane,
  collapseEmptyPane,
  leafPanes,
  paneById,
  removeTabFromPane,
  reorderPaneTabs,
  resizeSplit,
  setPaneActiveTab,
  singlePane,
  splitPane,
  tabPaneId,
  type LayoutNode,
  type LeafNode,
} from './workspaceLayout';

function leaf(
  id: string,
  tabIds: string[],
  activeTabId = tabIds[0] ?? ''
): LeafNode {
  return { type: 'leaf', id, tabIds, activeTabId };
}

describe('singlePane', () => {
  test('bootstraps a leaf from a flat tab list', () => {
    const layout = singlePane(['a', 'b'], 'b', 'pane_root');
    expect(layout).toEqual({
      type: 'leaf',
      id: 'pane_root',
      tabIds: ['a', 'b'],
      activeTabId: 'b',
    });
  });

  test('defaults active tab to the first id when omitted', () => {
    const layout = singlePane(['a', 'b']);
    expect(layout.type).toBe('leaf');
    if (layout.type !== 'leaf') return;
    expect(layout.activeTabId).toBe('a');
  });
});

describe('leafPanes / paneById / tabPaneId', () => {
  test('walks a nested split tree', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: {
        type: 'split',
        id: 's2',
        direction: 'column',
        sizes: [0.4, 0.6],
        first: leaf('p2', ['b', 'c']),
        second: leaf('p3', ['d']),
      },
    };
    expect(leafPanes(layout).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(paneById(layout, 'p2')?.tabIds).toEqual(['b', 'c']);
    expect(tabPaneId(layout, 'c')).toBe('p2');
    expect(tabPaneId(layout, 'missing')).toBeNull();
    expect(paneById(layout, 'nope')).toBeNull();
  });
});

describe('splitPane', () => {
  test('splits right (row, after) and keeps the original leaf', () => {
    const root = leaf('p1', ['a', 'b'], 'a');
    const next = splitPane(root, 'p1', 'row', 'after', leaf('p2', ['a-clone'], 'a-clone'));
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(next.direction).toBe('row');
    expect(next.sizes).toEqual([0.5, 0.5]);
    expect(next.first).toEqual(root);
    expect(next.second).toEqual(leaf('p2', ['a-clone'], 'a-clone'));
  });

  test('splits left (row, before) so the new leaf is first', () => {
    const root = leaf('p1', ['a']);
    const next = splitPane(root, 'p1', 'row', 'before', leaf('p2', ['clone']));
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(next.first.id).toBe('p2');
    expect(next.second.id).toBe('p1');
  });

  test('splits down (column, after) recursively inside an existing split', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: leaf('p2', ['b']),
    };
    const next = splitPane(
      layout,
      'p2',
      'column',
      'after',
      leaf('p3', ['b-clone'])
    );
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(next.first).toEqual(leaf('p1', ['a']));
    expect(next.second.type).toBe('split');
    if (next.second.type !== 'split') return;
    expect(next.second.direction).toBe('column');
    expect(next.second.first.id).toBe('p2');
    expect(next.second.second.id).toBe('p3');
  });

  test('returns the original tree when the pane id is missing', () => {
    const root = leaf('p1', ['a']);
    expect(splitPane(root, 'missing', 'row', 'after', leaf('p2', ['x']))).toBe(root);
  });
});

describe('resizeSplit', () => {
  test('updates sibling fractions on the matching split', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: leaf('p2', ['b']),
    };
    const next = resizeSplit(layout, 's1', [0.3, 0.7]);
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(next.sizes).toEqual([0.3, 0.7]);
  });

  test('clamps sizes to min fraction and renormalizes', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: leaf('p2', ['b']),
    };
    const next = resizeSplit(layout, 's1', [0.01, 0.99]);
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(next.sizes[0]).toBeGreaterThanOrEqual(0.1);
    expect(next.sizes[0] + next.sizes[1]).toBeCloseTo(1);
  });
});

describe('setPaneActiveTab / addTabToPane / reorderPaneTabs', () => {
  test('activates a tab that already lives in the pane', () => {
    const layout = leaf('p1', ['a', 'b'], 'a');
    const next = setPaneActiveTab(layout, 'p1', 'b');
    expect(paneById(next, 'p1')?.activeTabId).toBe('b');
  });

  test('ignores activate for a tab not in the pane', () => {
    const layout = leaf('p1', ['a'], 'a');
    expect(setPaneActiveTab(layout, 'p1', 'nope')).toBe(layout);
  });

  test('appends a tab and activates it', () => {
    const layout = leaf('p1', ['a'], 'a');
    const next = addTabToPane(layout, 'p1', 'b');
    const pane = paneById(next, 'p1');
    expect(pane?.tabIds).toEqual(['a', 'b']);
    expect(pane?.activeTabId).toBe('b');
  });

  test('does not duplicate an existing tab, but activates it', () => {
    const layout = leaf('p1', ['a', 'b'], 'a');
    const next = addTabToPane(layout, 'p1', 'a');
    expect(paneById(next, 'p1')?.tabIds).toEqual(['a', 'b']);
    expect(paneById(next, 'p1')?.activeTabId).toBe('a');
  });

  test('reorders tabs within a pane', () => {
    const layout = leaf('p1', ['a', 'b', 'c'], 'a');
    const next = reorderPaneTabs(layout, 'p1', 0, 2);
    expect(paneById(next, 'p1')?.tabIds).toEqual(['b', 'c', 'a']);
  });
});

describe('removeTabFromPane / collapseEmptyPane', () => {
  test('removes a tab and activates the previous neighbor', () => {
    const layout = leaf('p1', ['a', 'b', 'c'], 'b');
    const next = removeTabFromPane(layout, 'p1', 'b');
    const pane = paneById(next, 'p1');
    expect(pane?.tabIds).toEqual(['a', 'c']);
    expect(pane?.activeTabId).toBe('a');
  });

  test('keeps the last empty pane instead of collapsing it', () => {
    const layout = leaf('p1', ['a'], 'a');
    const next = removeTabFromPane(layout, 'p1', 'a');
    expect(next).toEqual(leaf('p1', [], ''));
  });

  test('collapses a split when a pane loses its last tab', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: leaf('p2', ['b']),
    };
    const next = removeTabFromPane(layout, 'p2', 'b');
    expect(next).toEqual(leaf('p1', ['a']));
  });

  test('unwraps nested splits after collapsing', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: {
        type: 'split',
        id: 's2',
        direction: 'column',
        sizes: [0.5, 0.5],
        first: leaf('p2', ['b']),
        second: leaf('p3', ['c']),
      },
    };
    const next = removeTabFromPane(layout, 'p2', 'b');
    expect(next.type).toBe('split');
    if (next.type !== 'split') return;
    expect(leafPanes(next).map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  test('collapseEmptyPane is a no-op when every leaf still has tabs', () => {
    const layout: LayoutNode = {
      type: 'split',
      id: 's1',
      direction: 'row',
      sizes: [0.5, 0.5],
      first: leaf('p1', ['a']),
      second: leaf('p2', ['b']),
    };
    expect(collapseEmptyPane(layout)).toBe(layout);
  });
});
