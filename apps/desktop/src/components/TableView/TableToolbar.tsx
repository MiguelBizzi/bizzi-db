import React, { useState } from 'react';
import { Filter, Plus, Trash2, Search, RefreshCw } from 'lucide-react';
import { TableSchema, FilterClause } from '../../types';
import { Select, SelectOption } from '../ui/Select';
import { DataExportMenu } from '../DataExport/DataExportMenu';

const REFRESH_SHORTCUT = /Mac|iPhone|iPad|iPod/i.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)
  ? '⌘R'
  : 'Ctrl+R';

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
  exportRows: Record<string, unknown>[];
  onRefresh: () => void;
  isLoading?: boolean;
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
  exportRows,
  onRefresh,
  isLoading = false,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const loadingHint = 'Unavailable while table data is loading';

  const openFilters = () => {
    setShowFilters(true);
    if (filters.length === 0) onAddFilter();
  };

  const operatorOptions: SelectOption<FilterClause['operator']>[] = [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: 'LIKE', label: 'LIKE' },
    { value: 'ILIKE', label: 'ILIKE' },
  ];

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

          {/* Filter Builder Toggle — first open adds a default condition */}
          <button
            type="button"
            onClick={() => (showFilters ? setShowFilters(false) : openFilters())}
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
            disabled={table.isView}
            title={table.isView ? 'Cannot insert into a view' : 'Add a row'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600/20"
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

        {/* Right Tools: Refresh & Export */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title={isLoading ? loadingHint : `Refresh Table (${REFRESH_SHORTCUT})`}
            aria-label="Refresh Table"
            className="p-1.5 rounded-lg bg-background border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <DataExportMenu
            columns={table.columns.map((column) => column.name)}
            rows={exportRows}
            tableName={table.name}
            schema={table.schema}
            disabled={isLoading}
            disabledReason={loadingHint}
          />
        </div>
      </div>

      {/* Filter Clauses Builder */}
      {showFilters && (
        <div className="p-2.5 bg-background border border-border rounded-xl space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground font-semibold">
            <span>Data Filter Rules</span>
            <button
              type="button"
              onClick={onAddFilter}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus className="w-3 h-3" />
              <span>Add Filter</span>
            </button>
          </div>

          {filters.length === 0 && (
            <div className="text-muted-foreground text-xs italic py-1">
              No filter conditions active. Click "Add Filter" to filter rows.
            </div>
          )}

          {filters.map((f) => (
            <div key={f.id} className="flex items-center gap-2 font-mono text-xs">
              <Select
                size="sm"
                className="w-40"
                value={f.column}
                options={table.columns.map((c) => ({ value: c.name, label: c.name }))}
                onChange={(value) => onUpdateFilter(f.id, 'column', value)}
                aria-label="Filter column"
              />

              <Select
                size="sm"
                className="w-[5.5rem]"
                value={f.operator}
                options={operatorOptions}
                onChange={(value) => onUpdateFilter(f.id, 'operator', value)}
                aria-label="Filter operator"
              />

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
    </div>
  );
};
