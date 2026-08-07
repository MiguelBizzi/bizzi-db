import React, { useState } from 'react';
import {
  Filter,
  Plus,
  Trash2,
  Download,
  Check,
  RotateCcw,
  Code,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Layers,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { TableSchema, FilterClause, PendingModifications } from '../../types';

interface TableToolbarProps {
  table: TableSchema;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  filters: FilterClause[];
  onAddFilter: () => void;
  onRemoveFilter: (id: string) => void;
  onUpdateFilter: (id: string, field: keyof FilterClause, val: any) => void;
  selectedRowsCount: number;
  onInsertRow: () => void;
  onDeleteSelectedRows: () => void;
  pendingModifications: PendingModifications;
  onCommitChanges: () => void;
  onRollbackChanges: () => void;
  onOpenSqlDiffModal: () => void;
  onExport: (format: 'csv' | 'json' | 'markdown' | 'sql') => void;
  limit: number;
  onLimitChange: (newLimit: number) => void;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  table,
  searchTerm,
  onSearchChange,
  filters,
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  selectedRowsCount,
  onInsertRow,
  onDeleteSelectedRows,
  pendingModifications,
  onCommitChanges,
  onRollbackChanges,
  onOpenSqlDiffModal,
  onExport,
  limit,
  onLimitChange,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const totalModifications =
    pendingModifications.updates.length +
    pendingModifications.inserts.length +
    pendingModifications.deletes.length;

  return (
    <div className="bg-card border-b border-border p-2.5 flex flex-col gap-2 shrink-0">
      {/* Top Main Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search data in rows..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-3 py-1 bg-background border border-border rounded-lg text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-48 sm:w-60"
            />
          </div>

          {/* Filter Builder Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              filters.length > 0 || showFilters
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters ({filters.length})</span>
          </button>

          {/* Insert Row */}
          <button
            onClick={onInsertRow}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>

          {/* Delete Selected Rows */}
          {selectedRowsCount > 0 && (
            <button
              onClick={onDeleteSelectedRows}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedRowsCount})</span>
            </button>
          )}
        </div>

        {/* Right Tools: Export & Limit */}
        <div className="flex items-center gap-2">
          {/* Limit selector */}
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <span>Limit:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="bg-background border border-border text-foreground rounded px-2 py-0.5 focus:outline-none cursor-pointer text-xs"
            >
              <option value={100} className="bg-popover text-popover-foreground">100</option>
              <option value={500} className="bg-popover text-popover-foreground">500</option>
              <option value={1000} className="bg-popover text-popover-foreground">1,000</option>
              <option value={5000} className="bg-popover text-popover-foreground">5,000</option>
            </select>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border hover:bg-accent text-foreground text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-40 text-xs text-popover-foreground">
                <button
                  onClick={() => {
                    onExport('csv');
                    setShowExportMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground font-mono"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>CSV File (.csv)</span>
                </button>

                <button
                  onClick={() => {
                    onExport('json');
                    setShowExportMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground font-mono"
                >
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>JSON File (.json)</span>
                </button>

                <button
                  onClick={() => {
                    onExport('sql');
                    setShowExportMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground font-mono"
                >
                  <Code className="w-3.5 h-3.5 text-amber-400" />
                  <span>SQL INSERT Script</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Clauses Builder */}
      {showFilters && (
        <div className="p-2.5 bg-background border border-border rounded-xl space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground font-semibold">
            <span>Data Filter Rules</span>
            <button
              onClick={onAddFilter}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus className="w-3 h-3" />
              <span>Add Condition</span>
            </button>
          </div>

          {filters.length === 0 && (
            <div className="text-muted-foreground text-xs italic py-1">
              No filter conditions active. Click "Add Condition" to filter rows.
            </div>
          )}

          {filters.map((f) => (
            <div key={f.id} className="flex items-center gap-2 font-mono text-xs">
              <select
                value={f.column}
                onChange={(e) => onUpdateFilter(f.id, 'column', e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-foreground"
              >
                {table.columns.map((c) => (
                  <option key={c.name} value={c.name} className="bg-popover text-popover-foreground">
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={f.operator}
                onChange={(e) => onUpdateFilter(f.id, 'operator', e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-foreground"
              >
                <option value="=" className="bg-popover text-popover-foreground">=</option>
                <option value="!=" className="bg-popover text-popover-foreground">!=</option>
                <option value=">" className="bg-popover text-popover-foreground">&gt;</option>
                <option value="<" className="bg-popover text-popover-foreground">&lt;</option>
                <option value=">=" className="bg-popover text-popover-foreground">&gt;=</option>
                <option value="<=" className="bg-popover text-popover-foreground">&lt;=</option>
                <option value="LIKE" className="bg-popover text-popover-foreground">LIKE</option>
                <option value="ILIKE" className="bg-popover text-popover-foreground">ILIKE</option>
              </select>

              <input
                type="text"
                value={f.value}
                onChange={(e) => onUpdateFilter(f.id, 'value', e.target.value)}
                placeholder="Filter value..."
                className="bg-card border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary w-40"
              />

              <button
                onClick={() => onRemoveFilter(f.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending Modifications Floating Commit Bar */}
      {totalModifications > 0 && (
        <div className="p-2.5 rounded-xl bg-card border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 text-amber-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-bold">
              ⚡ {totalModifications} Pending Modification
              {totalModifications > 1 ? 's' : ''}
            </span>
            <span className="text-amber-400/80 text-[11px]">
              ({pendingModifications.updates.length} updates,{' '}
              {pendingModifications.inserts.length} inserts,{' '}
              {pendingModifications.deletes.length} deletes)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSqlDiffModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background hover:bg-accent text-amber-400 border border-amber-500/30 text-xs font-mono font-medium transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Preview SQL Diff</span>
            </button>

            <button
              onClick={onRollbackChanges}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background hover:bg-accent text-foreground text-xs font-medium border border-border transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback</span>
            </button>

            <button
              onClick={onCommitChanges}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-xs shadow-md transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Commit Changes</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
