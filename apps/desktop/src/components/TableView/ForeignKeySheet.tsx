import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Check, Filter, Key, Link, LoaderCircle, Search, X } from 'lucide-react';
import { Drawer, DrawerPanel } from '../ui/Drawer';
import { FilterExpressionInput } from './FilterExpressionInput';
import type { DatabaseDialect, FilterClause, TableSchema } from '../../types';
import { registerScope } from '../../lib/commands/commandBus';
import { commitFilterExpression, serializeFilterExpression } from '../../lib/filterExpression';
import { rowKeyValue } from '../../lib/foreignKeyLookup';
import {
  buildSheetSql,
  FK_SHEET_PAGE,
  moveHighlight,
  sheetColumns,
} from '../../lib/foreignKeySheet';

export type FkLookupFn = (
  sql: string,
) => Promise<{ rows: Record<string, unknown>[]; error?: string }>;

export interface ForeignKeySheetProps {
  referencedTable: TableSchema;
  targetColumn: string;
  /** `table.column` the value is for, shown in the header. */
  sourceLabel: string;
  /** null when the field currently holds NULL. */
  currentValue: string | null;
  nullable: boolean;
  /** Search text the sheet opens with, e.g. the key typed on the closed field. */
  initialQuery?: string;
  dialect: DatabaseDialect;
  onLookup: FkLookupFn;
  onSelect: (value: string) => void;
  onSetNull: () => void;
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 150;
const LOAD_MORE_THRESHOLD_PX = 120;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ForeignKeySheetBody({
  referencedTable,
  targetColumn,
  sourceLabel,
  currentValue,
  nullable,
  initialQuery = '',
  dialect,
  onLookup,
  onSelect,
  onSetNull,
  onClose,
}: ForeignKeySheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterClause[]>([]);
  const [filterDraft, setFilterDraft] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const columns = useMemo(
    () => sheetColumns(referencedTable, targetColumn),
    [referencedTable, targetColumn],
  );
  const searchHint = columns.slice(0, 3).join(', ');
  const qualifiedName = referencedTable.schema
    ? `${referencedTable.schema}.${referencedTable.name}`
    : referencedTable.name;
  const filtersKey = serializeFilterExpression(filters, dialect);

  // The sheet sits over the grid or the Insert Row drawer; the menu must neither act on
  // them nor offer to open a second sheet.
  useEffect(() => {
    const scope = registerScope('modal:fk-sheet', {});
    scope.setContext({ modalOpen: true, foreignKeyTarget: false });
    return () => scope.dispose();
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const input = searchRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    return () => previous?.focus?.();
  }, []);

  // Capture phase: the Insert Row drawer closes itself on a window-level Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const runLookup = async (requestId: number, offset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const sql = buildSheetSql({
        table: referencedTable,
        targetColumn,
        query,
        filters,
        offset,
        limit: FK_SHEET_PAGE,
        dialect,
      });
      const result = await onLookup(sql);
      if (requestId !== requestRef.current) return;
      if (result.error) {
        setError(result.error);
        if (!append) setRows([]);
        setHasMore(false);
        return;
      }
      const page = result.rows.slice(0, FK_SHEET_PAGE);
      setHasMore(result.rows.length > FK_SHEET_PAGE);
      setRows((prev) => (append ? [...prev, ...page] : page));
      if (!append) {
        setHighlighted(0);
        listRef.current?.scrollTo({ top: 0 });
      }
    } catch (caught: unknown) {
      if (requestId !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Lookup failed');
      if (!append) setRows([]);
      setHasMore(false);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const requestId = ++requestRef.current;
    const handle = window.setTimeout(
      () => void runLookup(requestId, 0, false),
      query.trim() ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => window.clearTimeout(handle);
    // runLookup reads the latest query and filters; these keys say when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filtersKey, referencedTable.id, targetColumn]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    void runLookup(++requestRef.current, rows.length, true);
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-fk-index="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const pick = (row: Record<string, unknown> | undefined) => {
    if (!row) return;
    onSelect(rowKeyValue(row, targetColumn));
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const page = 10;
    const moves: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: page,
      PageUp: -page,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = moveHighlight(highlighted, moves[event.key], rows.length);
      setHighlighted(next);
      if (next >= rows.length - 3) loadMore();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      pick(rows[highlighted]);
    }
  };

  const submitFilter = (text: string): boolean => {
    const result = commitFilterExpression(
      text,
      filters,
      referencedTable.columns.map((column) => column.name),
      { nextId: (index) => `fk_${Date.now()}_${index}` },
    );
    if (result.kind === 'commit') {
      setFilters(result.filters);
      setFilterDraft('');
      setFilterError(null);
      searchRef.current?.focus();
      return true;
    }
    if (result.kind === 'invalid') setFilterError(result.message);
    return false;
  };

  const activeFilters = filters.filter((filter) => filter.enabled);

  return (
    <Drawer scrim={false}>
      {/* No dimming or blur: the grid row being linked stays readable beside the sheet. */}
      <div aria-hidden className="fixed inset-0" style={{ zIndex: 59 }} onClick={onClose} />
      <DrawerPanel
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a row from ${qualifiedName}`}
        style={{ zIndex: 60 }}
        className="fixed inset-y-0 right-0 w-full max-w-2xl flex flex-col bg-popover border-l border-border shadow-2xl font-sans text-popover-foreground overflow-hidden"
      >
        <header className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-border">
          <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Link className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground truncate">
              Choose a row from <span className="font-mono">{qualifiedName}</span>
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              {sourceLabel} → {referencedTable.name}.{targetColumn}
              {currentValue !== null && currentValue !== '' && (
                <> · current: {currentValue}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-accent text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-2.5 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="fk-sheet-results"
                aria-activedescendant={rows[highlighted] ? `fk-row-${highlighted}` : undefined}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={`Search ${searchHint}…`}
                className="w-full h-9 pl-8 pr-8 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
              {loading && (
                <LoaderCircle className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              aria-pressed={showFilters}
              className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border text-xs font-medium transition-colors ${
                showFilters || activeFilters.length
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {activeFilters.length > 0 && (
                <span className="px-1.5 rounded-full bg-primary/20 text-[10px]">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <FilterExpressionInput
              value={filterDraft}
              onChange={(value) => {
                setFilterDraft(value);
                setFilterError(null);
              }}
              onSubmit={submitFilter}
              columns={referencedTable.columns}
              dialect={dialect}
              valueHints={{}}
              error={filterError}
              placeholder="e.g. status = 'active' AND country = 'BR', then Enter"
              autoFocus
            />
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map((filter) => (
                <span
                  key={filter.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-muted border border-border text-[11px] font-mono text-foreground"
                >
                  {serializeFilterExpression([filter], dialect)}
                  <button
                    type="button"
                    aria-label="Remove filter"
                    onClick={() => setFilters((prev) => prev.filter((f) => f.id !== filter.id))}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div
          ref={listRef}
          id="fk-sheet-results"
          role="listbox"
          aria-label={`Rows of ${qualifiedName}`}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_THRESHOLD_PX) {
              loadMore();
            }
          }}
          className="flex-1 min-h-0 overflow-auto"
        >
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-popover">
              <tr className="border-b border-border">
                <th className="w-7" />
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      {column === targetColumn && <Key className="w-3 h-3 text-amber-400" />}
                      {column}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = rowKeyValue(row, targetColumn);
                const active = index === highlighted;
                const selected = currentValue !== null && key === currentValue;
                return (
                  <tr
                    key={`${key}-${index}`}
                    id={`fk-row-${index}`}
                    role="option"
                    aria-selected={active}
                    data-fk-index={index}
                    onMouseMove={() => {
                      if (!active) setHighlighted(index);
                    }}
                    onClick={() => pick(row)}
                    className={`cursor-pointer border-b border-border/50 ${
                      active ? 'bg-primary/15' : 'hover:bg-accent/60'
                    }`}
                  >
                    <td className="pl-3 text-primary">
                      {selected && <Check className="w-3.5 h-3.5" aria-label="Current value" />}
                    </td>
                    {columns.map((column) => {
                      const value = row[column];
                      const text = cellText(value);
                      return (
                        <td
                          key={column}
                          title={text}
                          className={`px-3 py-2 max-w-[260px] truncate whitespace-nowrap ${
                            column === targetColumn ? 'font-mono text-foreground' : 'text-foreground/90'
                          }`}
                        >
                          {value === null || value === undefined ? (
                            <span className="italic text-muted-foreground">NULL</span>
                          ) : (
                            text
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {error && (
            <div className="px-4 py-3 text-[11px] font-mono text-rose-300">{error}</div>
          )}
          {!error && !loading && rows.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              {query.trim() || activeFilters.length
                ? 'No rows match your search.'
                : `${qualifiedName} has no rows.`}
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="w-full py-2 text-[11px] font-medium text-primary hover:bg-accent disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-background/60 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-3 font-mono">
            <span>↑↓ move</span>
            <span>↵ choose</span>
            <span>esc close</span>
            <span className="hidden sm:inline">
              {rows.length} row{rows.length === 1 ? '' : 's'}
              {hasMore ? ' loaded, more available' : ''}
            </span>
          </span>
          {nullable && (
            <button
              type="button"
              onClick={onSetNull}
              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-accent text-foreground text-xs font-medium"
            >
              Set NULL
            </button>
          )}
        </footer>
      </DrawerPanel>
    </Drawer>
  );
}

export function ForeignKeySheet(props: ForeignKeySheetProps & { open: boolean }) {
  const { open, ...rest } = props;
  return (
    <AnimatePresence>{open && <ForeignKeySheetBody key="fk-sheet" {...rest} />}</AnimatePresence>
  );
}
