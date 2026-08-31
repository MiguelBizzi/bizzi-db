import React, { useRef } from 'react';
import type { WorkspaceTab } from '../types';
import { TabsBar } from './TabsBar';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import type { CloseTabKind } from '../lib/tabPaneActions';
import {
  clampSplitSizes,
  type LayoutNode,
  type SplitDirection,
  type SplitSide,
} from '../lib/workspaceLayout';

const MIN_PANE_PX = 80;

interface WorkspacePanesProps {
  layout: LayoutNode;
  tabs: WorkspaceTab[];
  focusedPaneId: string;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onCloseTabs: (paneId: string, tabId: string, kind: CloseTabKind) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onSplitPane: (
    paneId: string,
    tabId: string,
    direction: SplitDirection,
    side: SplitSide
  ) => void;
  onReorderTabs: (paneId: string, fromIndex: number, toIndex: number) => void;
  onOpenNewQueryTab: (paneId: string) => void;
  onResizeSplit: (splitId: string, sizes: [number, number]) => void;
  renderTabContent: (tab: WorkspaceTab) => React.ReactNode;
}

export function WorkspacePanes(props: WorkspacePanesProps) {
  return (
    <div className="w-full h-full min-w-0 min-h-0">
      <PaneNode node={props.layout} {...props} />
    </div>
  );
}

function PaneNode({
  node,
  ...rest
}: WorkspacePanesProps & { node: LayoutNode }) {
  if (node.type === 'leaf') {
    return <LeafPane pane={node} {...rest} />;
  }

  return (
    <div
      className={`flex w-full h-full min-w-0 min-h-0 overflow-hidden ${
        node.direction === 'row' ? 'flex-row' : 'flex-col'
      }`}
    >
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{ flex: `${node.sizes[0]} 1 0%` }}
      >
        <PaneNode node={node.first} {...rest} />
      </div>
      <SplitHandle
        direction={node.direction}
        onResize={(sizes) => rest.onResizeSplit(node.id, sizes)}
      />
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{ flex: `${node.sizes[1]} 1 0%` }}
      >
        <PaneNode node={node.second} {...rest} />
      </div>
    </div>
  );
}

function LeafPane({
  pane,
  tabs,
  focusedPaneId,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onCloseTabs,
  onRenameTab,
  onSplitPane,
  onReorderTabs,
  onOpenNewQueryTab,
  renderTabContent,
}: WorkspacePanesProps & { pane: Extract<LayoutNode, { type: 'leaf' }> }) {
  const paneTabs = pane.tabIds
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is WorkspaceTab => Boolean(tab));
  const activeTab = tabs.find((tab) => tab.id === pane.activeTabId);

  return (
    <div
      className="flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden"
      onMouseDown={() => onFocusPane(pane.id)}
    >
      <TabsBar
        tabs={paneTabs}
        activeTabId={pane.activeTabId}
        focused={focusedPaneId === pane.id}
        onSelectTab={(tabId) => onSelectTab(pane.id, tabId)}
        onCloseTab={(tabId) => onCloseTab(pane.id, tabId)}
        onCloseTabs={(tabId, kind) => onCloseTabs(pane.id, tabId, kind)}
        onRenameTab={onRenameTab}
        onSplitPane={(tabId, direction, side) =>
          onSplitPane(pane.id, tabId, direction, side)
        }
        onOpenNewQueryTab={() => onOpenNewQueryTab(pane.id)}
        onReorderTabs={(from, to) => onReorderTabs(pane.id, from, to)}
      />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeTab ? (
          renderTabContent(activeTab)
        ) : (
          <WorkspaceEmptyState onOpenNewQuery={() => onOpenNewQueryTab(pane.id)} />
        )}
      </div>
    </div>
  );
}

function SplitHandle({
  direction,
  onResize,
}: {
  direction: SplitDirection;
  onResize: (sizes: [number, number]) => void;
}) {
  const dragging = useRef(false);
  const isRow = direction === 'row';

  const applyPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const total = isRow ? rect.width : rect.height;
    if (total <= 0) return;
    const offset = isRow ? event.clientX - rect.left : event.clientY - rect.top;
    const minFrac = Math.min(0.45, MIN_PANE_PX / total);
    const first = Math.min(1 - minFrac, Math.max(minFrac, offset / total));
    onResize(clampSplitSizes([first, 1 - first]));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize';
    applyPointer(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    applyPointer(event);
  };

  const endDrag = () => {
    dragging.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };
  return (
    <div
      role="separator"
      aria-orientation={isRow ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`shrink-0 bg-border hover:bg-primary/60 active:bg-primary z-10 ${
        isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      }`}
    />
  );
}
