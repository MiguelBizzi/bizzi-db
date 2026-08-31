import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Table,
  Code,
  Network,
  Activity,
  Logs,
  Sparkles,
  ArrowRight,
  X,
  ListChecks,
} from 'lucide-react';
import { DatabaseSchema, TableSchema, SavedQuery } from '../types';
import { knownRowCount } from '../lib/format';

const isApplePlatform =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

const MOD_K = isApplePlatform ? '⌘K' : 'Ctrl+K';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  databases: DatabaseSchema[];
  currentDatabase: DatabaseSchema | null;
  savedQueries: SavedQuery[];
  onSelectTable: (table: TableSchema) => void;
  onSelectQuery: (sql: string) => void;
  onOpenErd: () => void;
  onOpenMetrics: () => void;
  onOpenActivityLog: () => void;
  onOpenPendingChanges: () => void;
  onOpenNewQuery: () => void;
  onSelectDatabase: (dbId: string) => void;
}

type PaletteItem = {
  id: string;
  run: () => void;
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  currentDatabase,
  savedQueries,
  onSelectTable,
  onSelectQuery,
  onOpenErd,
  onOpenMetrics,
  onOpenActivityLog,
  onOpenPendingChanges,
  onOpenNewQuery,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const selectedIndexRef = useRef(0);
  const itemsRef = useRef<PaletteItem[]>([]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string) =>
    !normalizedQuery || value.toLowerCase().includes(normalizedQuery);

  const quickActions = useMemo(
    () =>
      [
        {
          id: 'action-new-query',
          label: 'Open New SQL Query Tab',
          icon: Code,
          iconClass: 'text-primary',
          shortcut: isApplePlatform ? '⌘T' : 'Ctrl+T',
          run: () => {
            onOpenNewQuery();
            onClose();
          },
        },
        {
          id: 'action-erd',
          label: 'Open Interactive Visual Schema ERD',
          icon: Network,
          iconClass: 'text-primary',
          run: () => {
            onOpenErd();
            onClose();
          },
        },
        {
          id: 'action-metrics',
          label: 'Database Health & Slow Query Analytics',
          icon: Activity,
          iconClass: 'text-emerald-400',
          run: () => {
            onOpenMetrics();
            onClose();
          },
        },
        {
          id: 'action-pending',
          label: 'Review Pending Changes',
          icon: ListChecks,
          iconClass: 'text-amber-400',
          run: () => {
            onOpenPendingChanges();
            onClose();
          },
        },
        {
          id: 'action-activity',
          label: 'Open Real-Time Activity Audit Stream',
          icon: Logs,
          iconClass: 'text-secondary',
          run: () => {
            onOpenActivityLog();
            onClose();
          },
        },
      ].filter((action) => matches(action.label)),
    [
      normalizedQuery,
      onClose,
      onOpenActivityLog,
      onOpenPendingChanges,
      onOpenErd,
      onOpenMetrics,
      onOpenNewQuery,
    ]
  );

  const filteredTables = useMemo(
    () => (currentDatabase?.tables || []).filter((table) => matches(table.name)),
    [currentDatabase, normalizedQuery]
  );

  const filteredQueries = useMemo(
    () =>
      savedQueries.filter(
        (saved) => matches(saved.title) || matches(saved.sql)
      ),
    [savedQueries, normalizedQuery]
  );

  const items: PaletteItem[] = useMemo(
    () => [
      ...quickActions.map((action) => ({ id: action.id, run: action.run })),
      ...filteredTables.map((table) => ({
        id: `table-${table.id}`,
        run: () => {
          onSelectTable(table);
          onClose();
        },
      })),
      ...filteredQueries.map((saved) => ({
        id: `query-${saved.id}`,
        run: () => {
          onSelectQuery(saved.sql);
          onClose();
        },
      })),
    ],
    [
      quickActions,
      filteredTables,
      filteredQueries,
      onSelectTable,
      onSelectQuery,
      onClose,
    ]
  );

  itemsRef.current = items;
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    const focusTimer = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length === 0 ? 0 : items.length - 1);
    }
  }, [items.length, selectedIndex]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, query]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      const count = itemsRef.current.length;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (count === 0) return;
        setSelectedIndex((index) => (index + 1) % count);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (count === 0) return;
        setSelectedIndex((index) => (index - 1 + count) % count);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        itemsRef.current[selectedIndexRef.current]?.run();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const itemClass = (index: number) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-xl text-foreground transition-colors ${
      index === selectedIndex
        ? 'bg-accent text-foreground'
        : 'hover:bg-accent hover:text-foreground'
    }`;

  let itemIndex = -1;
  const nextIndex = () => {
    itemIndex += 1;
    return itemIndex;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center px-4 py-3 border-b border-border bg-background/60">
          <Search className="w-5 h-5 text-primary mr-3" />
          <input
            ref={inputRef}
            type="text"
            autoFocus
            placeholder={`Search tables, SQL queries, or jump to actions… (${MOD_K})`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-foreground placeholder-muted-foreground text-sm focus:outline-none font-mono"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
          />
          <kbd className="hidden sm:inline px-1.5 py-0.5 mr-2 text-[10px] font-mono bg-muted border border-border rounded text-muted-foreground">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          id="command-palette-results"
          className="max-h-[380px] overflow-y-auto p-2 space-y-4 font-sans text-xs"
          role="listbox"
        >
          {quickActions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Quick Workspace Commands
              </div>
              <div className="space-y-1 mt-1">
                {quickActions.map((action) => {
                  const index = nextIndex();
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="option"
                      aria-selected={index === selectedIndex}
                      ref={index === selectedIndex ? selectedRef : undefined}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={action.run}
                      className={itemClass(index)}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${action.iconClass}`} />
                        <span>{action.label}</span>
                      </div>
                      {'shortcut' in action && action.shortcut ? (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {action.shortcut}
                        </span>
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredTables.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Tables & Views ({filteredTables.length})
              </div>
              <div className="space-y-1 mt-1">
                {filteredTables.map((table) => {
                  const index = nextIndex();
                  return (
                    <button
                      key={table.id}
                      type="button"
                      role="option"
                      aria-selected={index === selectedIndex}
                      ref={index === selectedIndex ? selectedRef : undefined}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onSelectTable(table);
                        onClose();
                      }}
                      className={itemClass(index)}
                    >
                      <div className="flex items-center gap-2.5 font-mono">
                        <Table className="w-4 h-4 text-primary" />
                        <span>{table.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        {knownRowCount(table.rowCount) !== null && (
                          <span>{table.rowCount.toLocaleString()} rows</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {table.schema}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredQueries.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Saved Queries ({filteredQueries.length})
              </div>
              <div className="space-y-1 mt-1">
                {filteredQueries.map((saved) => {
                  const index = nextIndex();
                  return (
                    <button
                      key={saved.id}
                      type="button"
                      role="option"
                      aria-selected={index === selectedIndex}
                      ref={index === selectedIndex ? selectedRef : undefined}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onSelectQuery(saved.sql);
                        onClose();
                      }}
                      className={`${itemClass(index)} text-left`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground truncate">{saved.title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate">
                          {saved.sql}
                        </div>
                      </div>
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-muted-foreground">
              No matching tables, queries, or commands.
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-background text-[10px] text-muted-foreground flex items-center justify-between font-mono">
          <span>↑↓ navigate • Enter select • Esc close • {MOD_K} toggle</span>
          <span>Active DB: {currentDatabase?.name || 'none'}</span>
        </div>
      </div>
    </div>
  );
};
