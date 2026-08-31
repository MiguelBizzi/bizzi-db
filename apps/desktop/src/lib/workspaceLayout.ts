export type SplitDirection = 'row' | 'column';
export type SplitSide = 'before' | 'after';

export interface LeafNode {
  type: 'leaf';
  id: string;
  tabIds: string[];
  activeTabId: string;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  sizes: [number, number];
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = LeafNode | SplitNode;

const MIN_SPLIT_FRACTION = 0.1;

let layoutSeq = 0;

export function nextLayoutId(prefix = 'pane'): string {
  layoutSeq += 1;
  return `${prefix}_${layoutSeq}`;
}

export function singlePane(
  tabIds: string[],
  activeTabId?: string,
  id = 'pane_root'
): LeafNode {
  return {
    type: 'leaf',
    id,
    tabIds,
    activeTabId: activeTabId ?? tabIds[0] ?? '',
  };
}

export function leafPanes(layout: LayoutNode): LeafNode[] {
  if (layout.type === 'leaf') return [layout];
  return [...leafPanes(layout.first), ...leafPanes(layout.second)];
}

export function paneById(layout: LayoutNode, paneId: string): LeafNode | null {
  if (layout.type === 'leaf') return layout.id === paneId ? layout : null;
  return paneById(layout.first, paneId) ?? paneById(layout.second, paneId);
}

export function tabPaneId(layout: LayoutNode, tabId: string): string | null {
  for (const pane of leafPanes(layout)) {
    if (pane.tabIds.includes(tabId)) return pane.id;
  }
  return null;
}

function mapNode(
  layout: LayoutNode,
  targetId: string,
  update: (node: LayoutNode) => LayoutNode
): LayoutNode {
  if (layout.id === targetId) return update(layout);
  if (layout.type === 'leaf') return layout;
  const first = mapNode(layout.first, targetId, update);
  const second = mapNode(layout.second, targetId, update);
  if (first === layout.first && second === layout.second) return layout;
  return { ...layout, first, second };
}

export function splitPane(
  layout: LayoutNode,
  paneId: string,
  direction: SplitDirection,
  side: SplitSide,
  newLeaf: LeafNode
): LayoutNode {
  if (!paneById(layout, paneId)) return layout;
  return mapNode(layout, paneId, (node) => {
    const split: SplitNode = {
      type: 'split',
      id: nextLayoutId('split'),
      direction,
      sizes: [0.5, 0.5],
      first: side === 'before' ? newLeaf : node,
      second: side === 'before' ? node : newLeaf,
    };
    return split;
  });
}

export function clampSplitSizes(sizes: [number, number]): [number, number] {
  let [first, second] = sizes;
  if (!Number.isFinite(first) || !Number.isFinite(second) || first + second <= 0) {
    return [0.5, 0.5];
  }
  const total = first + second;
  first /= total;
  second /= total;
  if (first < MIN_SPLIT_FRACTION) {
    first = MIN_SPLIT_FRACTION;
    second = 1 - MIN_SPLIT_FRACTION;
  } else if (second < MIN_SPLIT_FRACTION) {
    second = MIN_SPLIT_FRACTION;
    first = 1 - MIN_SPLIT_FRACTION;
  }
  return [first, second];
}

export function resizeSplit(
  layout: LayoutNode,
  splitId: string,
  sizes: [number, number]
): LayoutNode {
  return mapNode(layout, splitId, (node) => {
    if (node.type !== 'split') return node;
    return { ...node, sizes: clampSplitSizes(sizes) };
  });
}

export function setPaneActiveTab(
  layout: LayoutNode,
  paneId: string,
  tabId: string
): LayoutNode {
  return mapNode(layout, paneId, (node) => {
    if (node.type !== 'leaf' || !node.tabIds.includes(tabId)) return node;
    if (node.activeTabId === tabId) return node;
    return { ...node, activeTabId: tabId };
  });
}

export function addTabToPane(
  layout: LayoutNode,
  paneId: string,
  tabId: string
): LayoutNode {
  return mapNode(layout, paneId, (node) => {
    if (node.type !== 'leaf') return node;
    if (node.tabIds.includes(tabId)) {
      return node.activeTabId === tabId ? node : { ...node, activeTabId: tabId };
    }
    return { ...node, tabIds: [...node.tabIds, tabId], activeTabId: tabId };
  });
}

export function reorderPaneTabs(
  layout: LayoutNode,
  paneId: string,
  fromIndex: number,
  toIndex: number
): LayoutNode {
  return mapNode(layout, paneId, (node) => {
    if (node.type !== 'leaf') return node;
    const { tabIds } = node;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tabIds.length ||
      toIndex >= tabIds.length
    ) {
      return node;
    }
    const next = [...tabIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { ...node, tabIds: next };
  });
}

function nextActiveAfterClose(tabIds: string[], closedId: string, activeTabId: string): string {
  if (activeTabId !== closedId) {
    return tabIds.includes(activeTabId) ? activeTabId : tabIds[tabIds.length - 1] ?? '';
  }
  const closedIndex = tabIds.indexOf(closedId);
  const remaining = tabIds.filter((id) => id !== closedId);
  if (remaining.length === 0) return '';
  const previous = closedIndex > 0 ? tabIds[closedIndex - 1] : remaining[0];
  return remaining.includes(previous) ? previous : remaining[0];
}

export function collapseEmptyPane(layout: LayoutNode): LayoutNode {
  if (layout.type === 'leaf') return layout;
  const first = collapseEmptyPane(layout.first);
  const second = collapseEmptyPane(layout.second);
  const firstEmpty = first.type === 'leaf' && first.tabIds.length === 0;
  const secondEmpty = second.type === 'leaf' && second.tabIds.length === 0;
  if (firstEmpty && !secondEmpty) return second;
  if (secondEmpty && !firstEmpty) return first;
  if (firstEmpty && secondEmpty) return first;
  if (first === layout.first && second === layout.second) return layout;
  return { ...layout, first, second };
}

export function removeTabFromPane(
  layout: LayoutNode,
  paneId: string,
  tabId: string
): LayoutNode {
  const updated = mapNode(layout, paneId, (node) => {
    if (node.type !== 'leaf' || !node.tabIds.includes(tabId)) return node;
    const activeTabId = nextActiveAfterClose(node.tabIds, tabId, node.activeTabId);
    return {
      ...node,
      tabIds: node.tabIds.filter((id) => id !== tabId),
      activeTabId,
    };
  });
  return collapseEmptyPane(updated);
}

export function focusedActiveTabId(layout: LayoutNode, focusedPaneId: string): string {
  return paneById(layout, focusedPaneId)?.activeTabId ?? leafPanes(layout)[0]?.activeTabId ?? '';
}

export function resolveFocusedPaneId(layout: LayoutNode, focusedPaneId: string): string {
  if (paneById(layout, focusedPaneId)) return focusedPaneId;
  return leafPanes(layout)[0]?.id ?? focusedPaneId;
}

export function replacePane(
  layout: LayoutNode,
  paneId: string,
  nextPane: LeafNode
): LayoutNode {
  return mapNode(layout, paneId, (node) => (node.type === 'leaf' ? nextPane : node));
}
