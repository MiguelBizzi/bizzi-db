import React, { useMemo, useState, type Ref, type RefObject } from 'react';
import { Check, Filter, Plus, Trash2, Search, RefreshCw, X } from 'lucide-react';
import { dialectModule } from '@db/database';
import { TableSchema, FilterClause, type DatabaseDialect } from '../../types';
import { Select, SelectOption } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { DataExportMenu } from '../DataExport/DataExportMenu';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { FilterExpressionInput, type FilterExpressionInputHandle } from './FilterExpressionInput';
import {
  createDefaultFilter,
  filterNeedsValue,
  filterRuleFieldsClass,
  isFilterIncomplete,
} from '../../lib/tableFilters';
import { commitFilterExpression, valueHintsFromRows } from '../../lib/filterExpression';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';

const REFRESH_SHORTCUT = shortcutLabel('conn.refreshTable');

interface TableToolbarProps {
  table: TableSchema;
  dialect?: DatabaseDialect;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  filters: FilterClause[];
  onRemoveFilter: (id: string) => void;
  onUpdateFilter: (id: string, field: keyof FilterClause, val: any) => void;
  onSetFilters: (filters: FilterClause[]) => void;
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
  hiddenColumns: string[];
  onHiddenColumnsChange: (hidden: string[]) => void;
  selectedRowsCount: number;
  /** "query" drops search and filters, which make little sense on a SQL result. */
  variant?: 'table' | 'query';
  readOnly?: boolean;
  readOnlyReason?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onInsertRow: () => void;
  onDeleteSelectedRows: () => void;
  exportRows: Record<string, unknown>[];
  /** Fetches every row, so Copy and Export cover more than the loaded page. */
  fetchAllRows?: () => Promise<Record<string, unknown>[]>;
  onRefresh: () => void;
  isLoading?: boolean;
  /** Handle to the filter expression input, set while the filter panel is open. */
  filterInputRef?: Ref<FilterExpressionInputHandle>;
  /** Receives the Export menu's default CSV export (see `DataExportMenu`). */
  exportTriggerRef?: RefObject<(() => void) | null>;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  table,
  dialect = 'PostgreSQL',
  searchTerm,
  onSearchChange,
  filters,
  onRemoveFilter,
  onUpdateFilter,
  onSetFilters,
  showFilters,
  onShowFiltersChange,
  hiddenColumns,
  onHiddenColumnsChange,
  selectedRowsCount,
  variant = 'table',
  readOnly = false,
  readOnlyReason,
  leading,
  trailing,
  onInsertRow,
  onDeleteSelectedRows,
  exportRows,
  fetchAllRows,
  onRefresh,
  isLoading = false,
  filterInputRef,
  exportTriggerRef,
}) => {
  const isQuery = variant === 'query';
  const insertBlocked = table.isView || readOnly;
  const insertTitle = readOnly
    ? (readOnlyReason ?? 'This result is read-only')
    : table.isView
      ? 'Cannot insert into a view'
      : 'Add a row';
  const loadingHint = 'Unavailable while table data is loading';
  const [draft, setDraft] = useState('');
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const columnNames = table.columns.map((column) => column.name);
  const valueHints = useMemo(
    () => valueHintsFromRows(table.columns, exportRows),
    [table.columns, exportRows]
  );

  const submitExpression = (text: string): boolean => {
    const result = commitFilterExpression(text, filters, columnNames, {
      nextId: (index) => `f_expr_${Date.now()}_${index}`,
    });
    if (result.kind === 'commit') {
      onSetFilters(result.filters);
      setDraft('');
      setExpressionError(null);
      return true;
    }
    if (result.kind === 'invalid') {
      setExpressionError(result.message);
      return false;
    }
    setExpressionError(null);
    return false;
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  // Other ways of opening the panel (cell filter, command) keep focus where it was.
  const [focusInputOnShow, setFocusInputOnShow] = useState(false);

  const openFilters = () => {
    setFocusInputOnShow(true);
    onShowFiltersChange(true);
  };

  const addCondition = () => {
    const condition = createDefaultFilter(table.columns[0]?.name ?? 'id');
    onSetFilters([...filters, condition]);
    setEditingId(condition.id);
  };

  const removeCondition = (id: string) => {
    onRemoveFilter(id);
    if (editingId === id) setEditingId(null);
  };

  const operatorOptions: SelectOption<FilterClause['operator']>[] = [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: 'LIKE', label: 'LIKE' },
    { value: 'ILIKE', label: dialectModule(dialect)?.capabilities.ilike === false ? 'LIKE' : 'ILIKE' },
    { value: 'IN', label: 'IN' },
    { value: 'IS NULL', label: 'IS NULL' },
    { value: 'IS NOT NULL', label: 'IS NOT NULL' },
  ];

  return (
    <div className="bg-card border-b border-border p-2.5 flex flex-col gap-2 shrink-0">
      {/* Top Main Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          {leading}

          {/* Quick Search */}
          {!isQuery && (
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
          )}

          {/* Filter Builder Toggle — first open adds a default condition */}
          {!isQuery && (
          <button
            type="button"
            onClick={() => (showFilters ? onShowFiltersChange(false) : openFilters())}
            className={`pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              filters.length > 0 || showFilters
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters ({filters.length})</span>
          </button>
          )}

          <ColumnVisibilityMenu
            columns={table.columns}
            hiddenColumns={hiddenColumns}
            onHiddenColumnsChange={onHiddenColumnsChange}
            disabled={isLoading}
          />

          {/* Insert Row */}
          <button
            onClick={onInsertRow}
            disabled={insertBlocked}
            title={insertTitle}
            className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>

          {/* Delete Selected Rows */}
          {selectedRowsCount > 0 && (
            <button
              onClick={onDeleteSelectedRows}
              className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedRowsCount})</span>
            </button>
          )}
        </div>

        {/* Right Tools: Refresh & Export */}
        <div className="flex items-center gap-2">
          {trailing}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title={
              isLoading
                ? loadingHint
                : isQuery
                  ? 'Re-run query'
                  : `Refresh Table (${REFRESH_SHORTCUT})`
            }
            aria-label={isQuery ? 'Re-run query' : 'Refresh Table'}
            className="p-1.5 rounded-lg bg-background border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <DataExportMenu
            columns={table.columns.map((column) => column.name)}
            rows={exportRows}
            loadAllRows={selectedRowsCount > 0 ? undefined : fetchAllRows}
            tableName={table.name}
            schema={table.schema}
            disabled={isLoading}
            disabledReason={loadingHint}
            exportTriggerRef={exportTriggerRef}
          />
        </div>
      </div>

      {!isQuery && showFilters && (
        <div className="p-2.5 bg-background border border-border rounded-xl space-y-2 field-message">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <FilterExpressionInput
                ref={filterInputRef}
                value={draft}
                onChange={(text) => {
                  setDraft(text);
                  setExpressionError(null);
                }}
                onSubmit={submitExpression}
                columns={table.columns}
                valueHints={valueHints}
                error={expressionError}
                placeholder={`Type a condition, e.g. ${columnNames[0] ?? 'id'} = value, then press Enter`}
                autoFocus={focusInputOnShow}
              />
            </div>
            <button
              type="button"
              onClick={addCondition}
              className="pressable shrink-0 flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add condition</span>
            </button>
          </div>

          {filters.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Quotes are optional. Combine conditions with AND, e.g.{' '}
              <span className="font-mono">
                {columnNames[0] ?? 'id'} = value AND {columnNames[1] ?? 'name'} LIKE %text%
              </span>
            </p>
          )}

          {filters.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {filters.map((f) =>
                f.id === editingId ? (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 w-full font-mono text-xs p-1.5 rounded-lg border border-primary/40 bg-card"
                  >
                    <div className={filterRuleFieldsClass(f.enabled)}>
                      <Select
                        size="sm"
                        className="w-40"
                        searchable
                        value={f.column}
                        options={table.columns.map((c) => ({ value: c.name, label: c.name }))}
                        onChange={(value) => onUpdateFilter(f.id, 'column', value)}
                        aria-label="Filter column"
                      />
                      <Select
                        size="sm"
                        className="w-[8.5rem]"
                        value={f.operator}
                        options={operatorOptions}
                        onChange={(value) => onUpdateFilter(f.id, 'operator', value)}
                        aria-label="Filter operator"
                      />
                      {filterNeedsValue(f.operator) && (
                        <input
                          type="text"
                          value={f.value}
                          onChange={(e) => onUpdateFilter(f.id, 'value', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingId(null);
                          }}
                          placeholder="Value"
                          aria-label="Filter value"
                          className="bg-background border border-border rounded-lg h-7 px-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-44"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Done editing filter"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCondition(f.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove filter"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ) : (
                  <li
                    key={f.id}
                    className="flex items-center gap-1.5 h-7 pl-2 pr-1 max-w-full rounded-lg border border-border bg-card font-mono text-xs"
                  >
                    <Checkbox
                      checked={f.enabled}
                      onCheckedChange={(checked) => onUpdateFilter(f.id, 'enabled', checked)}
                      aria-label={f.enabled ? 'Disable filter' : 'Enable filter'}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingId(f.id)}
                      title={isFilterIncomplete(f) ? 'Incomplete: needs a value to apply' : 'Edit condition'}
                      className={`${filterRuleFieldsClass(f.enabled)} hover:opacity-100 text-left`}
                    >
                      <span className="text-foreground truncate">{f.column}</span>
                      <span className="text-muted-foreground shrink-0">{f.operator}</span>
                      {filterNeedsValue(f.operator) && (
                        <span
                          className={`truncate ${f.value ? 'text-primary' : 'text-muted-foreground italic'}`}
                        >
                          {f.value || 'value'}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCondition(f.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
