import React from 'react';
import type { WorkspaceTab } from '../types';
import { TabsBar } from './TabsBar';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { SplitHandle } from './ui/SplitHandle';
import type { CloseTabKind } from '../lib/tabPaneActions';
import {
  type LayoutNode,
  type SplitDirection,
  type SplitSide,
} from '../lib/workspaceLayout';

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
