import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "../ui/Popover";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Copy, Key, Link, Loader2, X } from "lucide-react";
import type { TableSchema } from "../../types";
import { formatCellValue } from "../../lib/pendingChanges";
import {
  columnsForForeignRow,
  floaterPosition,
  foreignRowClipboardText,
} from "../../lib/foreignKeyLookup";
import { writeClipboard } from "../../lib/dataExport";
import { toast } from "../../lib/toast";

const FLOATER_WIDTH = 320;
const COPIED_FEEDBACK_MS = 1500;

interface ForeignKeyFloaterProps {
  anchor: DOMRect;
  targetTableName: string;
  targetColumn: string;
  value: unknown;
  loading: boolean;
  error?: string;
  table?: TableSchema;
  row: Record<string, unknown> | null;
  onClose: () => void;
  onNavigate?: (table: TableSchema) => void;
}

export const ForeignKeyFloater: React.FC<ForeignKeyFloaterProps> = ({
  anchor,
  targetTableName,
  targetColumn,
  value,
  loading,
  error,
  table,
  row,
  onClose,
  onNavigate,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number>(undefined);
  const [position, setPosition] = useState(() =>
    floaterPosition(
      anchor,
      { width: FLOATER_WIDTH, height: 220 },
      { width: window.innerWidth, height: window.innerHeight },
    ),
  );

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Layout size, not the rect: the panel is scaled down while it animates in.
    setPosition(
      floaterPosition(
        anchor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, loading, error, row, table]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const qualified = table
    ? table.schema
      ? `${table.schema}.${table.name}`
      : table.name
    : targetTableName;
  const columns = columnsForForeignRow(table, targetColumn, row);
  const pkNames = new Set(
    table?.columns
      .filter((column) => column.isPrimary)
      .map((column) => column.name) ?? [],
  );

  const copyRow = () => {
    if (!row) return;
    writeClipboard(foreignRowClipboardText(columns, row)).then(
      () => {
        setCopied(true);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(
          () => setCopied(false),
          COPIED_FEEDBACK_MS,
        );
      },
      () => toast.error("Could not copy to clipboard"),
    );
  };

  return createPortal(
    <Popover
      ref={panelRef}
      role="dialog"
      aria-label={`Referenced ${qualified} row`}
      className="fixed z-50 w-80 max-h-96 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground font-sans"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-3 py-2 border-b border-border bg-background/60 flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {qualified}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
            {targetColumn} = {formatCellValue(value)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close foreign key preview"
          className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            Loading referenced row…
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-xs text-rose-400 font-mono leading-relaxed">
            {error}
          </div>
        ) : !row ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No matching row in {qualified}.
          </div>
        ) : (
          <dl className="divide-y divide-border">
            {columns.map((name) => {
              const isPk = pkNames.has(name);
              const isTarget = name === targetColumn;
              return (
                <div
                  key={name}
                  className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-1.5 items-start"
                >
                  <dt className="flex items-center gap-1 min-w-0 text-[10px] font-mono text-muted-foreground">
                    {isPk && (
                      <Key className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span className="truncate" title={name}>
                      {name}
                    </span>
                    {isTarget && !isPk && (
                      <span className="text-primary shrink-0">FK</span>
                    )}
                  </dt>
                  <dd className="min-w-0 text-[11px] font-mono text-foreground break-all">
                    {row[name] === null || row[name] === undefined ? (
                      <span className="italic text-muted-foreground">NULL</span>
                    ) : (
                      formatCellValue(row[name])
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>

      {table && onNavigate && (
        <div className="px-3 py-2 border-t border-border bg-background/60 shrink-0 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyRow}
            disabled={!row}
            title="Copy the whole row as JSON"
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-medium border border-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? "Copied" : "Copy row"}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate(table)}
            disabled={loading}
            title={`Open ${qualified} filtered to ${targetColumn} = ${formatCellValue(value)}`}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover disabled:opacity-50 disabled:pointer-events-none"
          >
            <span>Go to row</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Popover>,
    document.body,
  );
};
