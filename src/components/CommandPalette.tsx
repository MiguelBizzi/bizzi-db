import React, { useState, useEffect } from 'react';
import {
  Search,
  Table,
  Code,
  Network,
  Activity,
  Terminal,
  Plus,
  Server,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { DatabaseSchema, TableSchema, SavedQuery } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  databases: DatabaseSchema[];
  currentDatabase: DatabaseSchema;
  savedQueries: SavedQuery[];
  onSelectTable: (table: TableSchema) => void;
  onSelectQuery: (sql: string) => void;
  onOpenErd: () => void;
  onOpenMetrics: () => void;
  onOpenActivityLog: () => void;
  onOpenNewQuery: () => void;
  onSelectDatabase: (dbId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  databases,
  currentDatabase,
  savedQueries,
  onSelectTable,
  onSelectQuery,
  onOpenErd,
  onOpenMetrics,
  onOpenActivityLog,
  onOpenNewQuery,
  onSelectDatabase,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTables = currentDatabase.tables.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  const filteredQueries = savedQueries.filter(
    (q) =>
      q.title.toLowerCase().includes(query.toLowerCase()) ||
      q.sql.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div
        className="w-full max-w-2xl bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-background/60">
          <Search className="w-5 h-5 text-primary mr-3" />
          <input
            type="text"
            autoFocus
            placeholder="Search tables, SQL queries, or jump to actions... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-foreground placeholder-muted-foreground text-sm focus:outline-none font-mono"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-4 font-sans text-xs">
          {/* Quick Actions Section */}
          <div>
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
              Quick Workspace Commands
            </div>
            <div className="space-y-1 mt-1">
              <button
                onClick={() => {
                  onOpenNewQuery();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent hover:text-foreground text-foreground transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Code className="w-4 h-4 text-primary" />
                  <span>Open New SQL Query Tab</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">⌘T</span>
              </button>

              <button
                onClick={() => {
                  onOpenErd();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent hover:text-foreground text-foreground transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Network className="w-4 h-4 text-primary" />
                  <span>Open Interactive Visual Schema ERD</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              <button
                onClick={() => {
                  onOpenMetrics();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent hover:text-foreground text-foreground transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Database Health & Slow Query Analytics</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              <button
                onClick={() => {
                  onOpenActivityLog();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent hover:text-foreground text-foreground transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <span>Open Real-Time Activity Audit Stream</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Tables Section */}
          {filteredTables.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Tables & Views ({filteredTables.length})
              </div>
              <div className="space-y-1 mt-1">
                {filteredTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => {
                      onSelectTable(table);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2.5 font-mono">
                      <Table className="w-4 h-4 text-primary" />
                      <span>{table.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>{table.rowCount.toLocaleString()} rows</span>
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {table.schema}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Saved Queries Section */}
          {filteredQueries.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Saved Queries ({filteredQueries.length})
              </div>
              <div className="space-y-1 mt-1">
                {filteredQueries.map((saved) => (
                  <button
                    key={saved.id}
                    onClick={() => {
                      onSelectQuery(saved.sql);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent text-foreground transition-colors text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-foreground truncate">
                        {saved.title}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate">
                        {saved.sql}
                      </div>
                    </div>
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-border bg-background text-[10px] text-muted-foreground flex items-center justify-between font-mono">
          <span>Navigate with ↑↓ • Select with Enter</span>
          <span>Active DB: {currentDatabase.name}</span>
        </div>
      </div>
    </div>
  );
};
