import React, { useRef, useState } from 'react';
import {
  Table as TableIcon,
  Code,
  Network,
  Activity,
  Logs,
  Edit3,
  Plus,
  X,
  Pin,
  Columns,
  Square,
} from 'lucide-react';
import { WorkspaceTab } from '../types';

interface TabsBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  isSplitView: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePinTab: (tabId: string) => void;
  onToggleSplitView: () => void;
  onOpenNewQueryTab: () => void;
  onOpenErdTab: () => void;
  onOpenMetricsTab: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
}

type DragSession = {
  fromIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  insertAt: number;
};

const DRAG_THRESHOLD_PX = 5;

function insertIndexToDestination(fromIndex: number, insertAt: number): number {
  return fromIndex < insertAt ? insertAt - 1 : insertAt;
}

function isNoOpReorder(fromIndex: number, insertAt: number): boolean {
  return insertAt === fromIndex || insertAt === fromIndex + 1;
}

export const TabsBar: React.FC<TabsBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onToggleSplitView,
  onOpenNewQueryTab,
  onReorderTabs,
  isSplitView,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const getTabIcon = (type: WorkspaceTab['type']) => {
    switch (type) {
      case 'table_data':
        return <TableIcon className="w-3.5 h-3.5 text-indigo-400" />;
      case 'sql_editor':
        return <Code className="w-3.5 h-3.5 text-emerald-400" />;
      case 'erd_schema':
        return <Network className="w-3.5 h-3.5 text-purple-400" />;
      case 'metrics':
        return <Activity className="w-3.5 h-3.5 text-amber-400" />;
      case 'activity_log':
        return <Logs className="w-3.5 h-3.5 text-secondary" />;
      case 'schema_designer':
        return <Edit3 className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <TableIcon className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const updateInsertIndex = (clientX: number) => {
    const list = listRef.current;
    if (!list || !dragRef.current) return;

    const rect = list.getBoundingClientRect();
    const edge = 40;
    if (clientX > rect.right - edge) {
      list.scrollLeft += 14;
    } else if (clientX < rect.left + edge) {
      list.scrollLeft -= 14;
    }

    const nodes = list.querySelectorAll<HTMLElement>('[data-tab-index]');
    let nextInsert = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      const tabRect = nodes[i].getBoundingClientRect();
      if (clientX < tabRect.left + tabRect.width / 2) {
        nextInsert = i;
        break;
      }
    }

    dragRef.current.insertAt = nextInsert;
    setInsertAt(nextInsert);
  };

  const clearDrag = () => {
    dragRef.current = null;
    setDraggedIndex(null);
    setInsertAt(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    dragRef.current = {
      fromIndex: index,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      insertAt: index,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (!session.active) {
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      session.active = true;
      setDraggedIndex(session.fromIndex);
    }

    e.preventDefault();
    updateInsertIndex(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== e.pointerId) {
      clearDrag();
      return;
    }

    if (session.active) {
      const destination = insertIndexToDestination(session.fromIndex, session.insertAt);
      if (onReorderTabs && destination !== session.fromIndex) {
        onReorderTabs(session.fromIndex, destination);
      }
      const draggedTab = tabs[session.fromIndex];
      if (draggedTab) onSelectTab(draggedTab.id);
      suppressClickRef.current = true;
      e.preventDefault();
    }
    clearDrag();
  };

  const showInsertAt = (index: number) =>
    draggedIndex !== null &&
    insertAt === index &&
    !isNoOpReorder(draggedIndex, insertAt);

  return (
    <div className="h-10 bg-background border-b border-border flex items-center px-2 select-none overflow-hidden shrink-0 text-foreground">
      <div
        ref={listRef}
        className="flex-1 min-w-0 h-full flex items-center gap-1 flex-nowrap overflow-x-auto overflow-y-hidden scrollbar-none"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggedIndex === index;

          return (
            <React.Fragment key={tab.id}>
              {showInsertAt(index) && (
                <div className="w-0.5 h-6 rounded-full bg-primary shrink-0" aria-hidden />
              )}
              <div
                data-tab-index={index}
                onPointerDown={(e) => handlePointerDown(e, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={clearDrag}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelectTab(tab.id);
                }}
                className={`group flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium border transition-colors cursor-grab active:cursor-grabbing shrink-0 max-w-[200px] touch-none ${
                  isDragging
                    ? 'opacity-40 bg-muted border-primary/50'
                    : isActive
                    ? 'bg-card border-border text-foreground shadow-sm font-semibold'
                    : 'bg-background/40 border-transparent hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="shrink-0">{getTabIcon(tab.type)}</div>

                <span className="truncate font-mono">{tab.title}</span>

                {tab.hasUncommittedChanges && (
                  <span
                    title="Uncommitted grid modifications"
                    className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"
                  />
                )}

                {tab.isQueryRunning && (
                  <span className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                )}

                {tab.isPinned && (
                  <Pin className="w-3 h-3 text-primary shrink-0 fill-primary/20" />
                )}

                {tabs.length > 1 && !tab.isPinned && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {draggedIndex !== null &&
          insertAt === tabs.length &&
          !isNoOpReorder(draggedIndex, insertAt) && (
            <div className="w-0.5 h-6 rounded-full bg-primary shrink-0" aria-hidden />
          )}
      </div>

      <button
        type="button"
        onClick={onOpenNewQueryTab}
        title="New query"
        className="ml-1 p-1.5 rounded-lg bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-1.5 shrink-0 ml-2 pl-2 border-l border-border">
        <button
          type="button"
          onClick={onToggleSplitView}
          title={isSplitView ? 'Switch to Single View' : 'Switch to Split Dual Pane'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
            isSplitView
              ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
              : 'bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground'
          }`}
        >
          {isSplitView ? (
            <>
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Single</span>
            </>
          ) : (
            <>
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split Dual</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
