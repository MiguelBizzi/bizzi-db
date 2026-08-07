import React, { useState } from 'react';
import {
  Table as TableIcon,
  Code,
  Network,
  Activity,
  Terminal,
  Edit3,
  Sparkles,
  Plus,
  X,
  Pin,
  Columns,
  Square,
  GripVertical,
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

export const TabsBar: React.FC<TabsBarProps> = ({
  tabs,
  activeTabId,
  isSplitView,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onToggleSplitView,
  onOpenNewQueryTab,
  onOpenErdTab,
  onOpenMetricsTab,
  onReorderTabs,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
        return <Terminal className="w-3.5 h-3.5 text-blue-400" />;
      case 'schema_designer':
        return <Edit3 className="w-3.5 h-3.5 text-rose-400" />;
      case 'ai_chat':
        return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <TableIcon className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index && onReorderTabs) {
      onReorderTabs(draggedIndex, index);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="h-10 bg-background border-b border-border flex items-center justify-between px-2 select-none overflow-x-auto scrollbar-none shrink-0 text-foreground">
      {/* Tabs list */}
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none py-1">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index && draggedIndex !== index;

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-grab active:cursor-grabbing shrink-0 max-w-[200px] ${
                isDragging
                  ? 'opacity-40 bg-muted border-primary/50'
                  : isDragOver
                  ? 'bg-primary/20 border-primary text-primary ring-1 ring-primary/40'
                  : isActive
                  ? 'bg-card border-border text-foreground shadow-sm font-semibold'
                  : 'bg-background/40 border-transparent hover:bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              <GripVertical className="w-3 h-3 text-muted-foreground/60 group-hover:text-muted-foreground shrink-0 cursor-grab" />
              <div className="shrink-0">{getTabIcon(tab.type)}</div>

              <span className="truncate font-mono">{tab.title}</span>

              {/* Uncommitted changes badge */}
              {tab.hasUncommittedChanges && (
                <span
                  title="Uncommitted grid modifications"
                  className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"
                />
              )}

              {/* Running query spinner */}
              {tab.isQueryRunning && (
                <span className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              )}

              {/* Pin indicator */}
              {tab.isPinned && (
                <Pin className="w-3 h-3 text-primary shrink-0 fill-primary/20" />
              )}

              {/* Close Button */}
              {tabs.length > 1 && !tab.isPinned && (
                <button
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
          );
        })}

        {/* Plus Tab Button with Tooltip */}
        <div className="relative group/plus">
          <button
            onClick={onOpenNewQueryTab}
            title="New query"
            className="p-1.5 rounded-lg bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-popover text-popover-foreground text-[10px] font-medium rounded shadow-lg border border-border whitespace-nowrap opacity-0 group-hover/plus:opacity-100 pointer-events-none transition-opacity z-50">
            New query
          </div>
        </div>
      </div>

      {/* Right Controls: Split View Toggle */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-border">
        <button
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
