import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, Search } from 'lucide-react';
import type { TableSchema } from '../../types';
import {
  buildLookupSql,
  FK_LOOKUP_PAGE,
  rowKeyValue,
  rowSecondaryLabel,
} from '../../lib/foreignKeyLookup';

export type FkLookupFn = (
  sql: string
) => Promise<{ rows: Record<string, unknown>[]; error?: string }>;

interface ForeignKeyPickerProps {
  id?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  targetColumn: string;
  referencedTable: TableSchema;
  onChange: (value: string) => void;
  onLookup: FkLookupFn;
}

export function ForeignKeyPicker({
  id,
  value,
  disabled = false,
  placeholder,
  targetColumn,
  referencedTable,
  onChange,
  onLookup,
}: ForeignKeyPickerProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const queryRef = useRef(value);
  const listId = useId();

  queryRef.current = value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || disabled) return;
    const requestId = ++requestRef.current;
    const handle = window.setTimeout(() => {
      void runLookup(requestId, queryRef.current, 0, false);
    }, value.trim() ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [open, disabled, value, referencedTable.id, targetColumn]);

  const runLookup = async (
    requestId: number,
    query: string,
    offset: number,
    append: boolean
  ) => {
    setLoading(true);
    setError(null);
    try {
      const sql = buildLookupSql(referencedTable, targetColumn, query, offset);
      const result = await onLookup(sql);
      if (requestId !== requestRef.current) return;
      if (result.error) {
        setError(result.error);
        if (!append) setRows([]);
        setHasMore(false);
        return;
      }
      const page = result.rows.slice(0, FK_LOOKUP_PAGE);
      setHasMore(result.rows.length > FK_LOOKUP_PAGE);
      setRows((prev) => (append ? [...prev, ...page] : page));
      if (!append) setHighlighted(0);
    } catch (caught: unknown) {
      if (requestId !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Lookup failed');
      if (!append) setRows([]);
      setHasMore(false);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const selectRow = (row: Record<string, unknown>) => {
    const key = rowKeyValue(row, targetColumn);
    const secondary = rowSecondaryLabel(row, targetColumn);
    onChange(key);
    setPickedLabel(secondary || key);
    setOpen(false);
  };

  const loadMore = () => {
    void runLookup(++requestRef.current, queryRef.current, rows.length, true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (rows[highlighted]) selectRow(rows[highlighted]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-fk-index="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  const showPicked = pickedLabel && pickedLabel !== value;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={value}
          placeholder={placeholder ?? 'Search or type an ID…'}
          onChange={(event) => {
            if (pickedLabel) setPickedLabel(null);
            onChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full h-9 pl-8 pr-8 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <ChevronDown
          className={`w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>
      {showPicked && (
        <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">{pickedLabel}</p>
      )}
      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
        >
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {error && (
              <div className="px-3 py-2 text-[11px] font-mono text-rose-300">{error}</div>
            )}
            {!error && !loading && rows.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                {value.trim() ? 'No matching rows' : 'No rows in referenced table'}
              </div>
            )}
            {rows.map((row, index) => {
              const key = rowKeyValue(row, targetColumn);
              const secondary = rowSecondaryLabel(row, targetColumn);
              const active = index === highlighted;
              const selected = key === value;
              return (
                <button
                  key={`${key}-${index}`}
                  type="button"
                  role="option"
                  data-fk-index={index}
                  aria-selected={selected}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => selectRow(row)}
                  className={`w-full px-3 py-1.5 text-left ${
                    active ? 'bg-primary/15' : 'hover:bg-accent'
                  }`}
                >
                  <div className="font-mono text-[11px] text-foreground truncate">
                    {targetColumn}: {key || 'NULL'}
                  </div>
                  {secondary && (
                    <div className="text-[10px] text-muted-foreground truncate">{secondary}</div>
                  )}
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="w-full px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-accent"
              >
                Load more
              </button>
            )}
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground font-mono">
              <LoaderCircle className="w-3 h-3 animate-spin" />
              Searching {referencedTable.schema}.{referencedTable.name}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
