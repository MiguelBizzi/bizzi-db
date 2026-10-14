import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { formatSizeMb } from "../../lib/format";
import { buildStorageDistribution, StorageRow } from "../../lib/storageDistribution";

interface StorageDistributionProps {
  tables: { name: string; sizeMb: number; isView?: boolean }[];
}

const SUMMARY_COUNT = 5;
const SEGMENT_OPACITY = [1, 0.8, 0.62, 0.48, 0.36];

const formatPct = (pct: number) =>
  pct > 0 && pct < 0.1 ? "<0.1%" : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;

export const StorageDistribution: React.FC<StorageDistributionProps> = ({
  tables,
}) => {
  const dist = useMemo(() => buildStorageDistribution(tables), [tables]);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const maxMb = dist.top[0]?.sizeMb ?? dist.other[0]?.sizeMb ?? 0;
  const searching = query.trim().length > 0;
  const allRows = useMemo(() => [...dist.top, ...dist.other], [dist]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allRows.filter((r) => r.name.toLowerCase().includes(q)) : [];
  }, [allRows, query]);

  const summary = dist.top.slice(0, SUMMARY_COUNT);
  const summaryPct = summary.reduce((s, r) => s + r.pct, 0);
  const headline =
    summary.length > 0 && dist.totalMb > 0
      ? `Top ${summary.length} ${summary.length === 1 ? "table uses" : "tables use"} ${Math.round(summaryPct)}% of ${formatSizeMb(dist.totalMb)}`
      : null;

  const focusRow = (name: string) => {
    setHighlight(name);
    rowRefs.current.get(name)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const renderRow = (row: StorageRow, muted = false) => (
    <div
      key={row.name}
      ref={(el) => {
        if (el) rowRefs.current.set(row.name, el);
        else rowRefs.current.delete(row.name);
      }}
      title={`${row.name} · ${formatSizeMb(row.sizeMb)} · ${row.pct.toFixed(2)}% of total`}
      onMouseEnter={() => setHighlight(row.name)}
      onMouseLeave={() => setHighlight(null)}
      className={`grid grid-cols-[minmax(0,10rem)_1fr_5.5rem_3rem] sm:grid-cols-[minmax(0,14rem)_1fr_6.5rem_3.5rem] items-center gap-3 px-2 py-1.5 rounded-lg transition-colors ${
        highlight === row.name ? "bg-muted/60" : ""
      }`}
    >
      <span className="truncate text-foreground">{row.name}</span>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            muted ? "bg-muted-foreground/50" : "bg-primary"
          }`}
          style={{
            width: `${maxMb > 0 ? Math.max((row.sizeMb / maxMb) * 100, row.sizeMb > 0 ? 1 : 0) : 0}%`,
          }}
        />
      </div>
      <span className="text-right tabular-nums text-foreground">
        {formatSizeMb(row.sizeMb)}
      </span>
      <span className="text-right tabular-nums text-muted-foreground">
        {formatPct(row.pct)}
      </span>
    </div>
  );

  return (
    <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold text-foreground">Storage Distribution</div>
        {headline && (
          <div className="text-[11px] text-muted-foreground">{headline}</div>
        )}
      </div>

      {allRows.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No storage data available
          {dist.unknown.length > 0 &&
            ` · ${dist.unknown.length} without size data`}
        </div>
      ) : (
        <>
          {dist.totalMb > 0 && (
            <div
              className="flex h-3 w-full gap-px overflow-hidden rounded-full bg-muted/50"
              role="img"
              aria-label="Top tables share of total storage"
            >
              {summary.map((row, i) => (
                <button
                  key={row.name}
                  type="button"
                  title={`${row.name} · ${formatSizeMb(row.sizeMb)} · ${formatPct(row.pct)}`}
                  onClick={() => focusRow(row.name)}
                  onMouseEnter={() => setHighlight(row.name)}
                  onMouseLeave={() => setHighlight(null)}
                  className="h-full bg-primary transition-opacity hover:!opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    width: `${row.pct}%`,
                    opacity: highlight && highlight !== row.name ? 0.35 : SEGMENT_OPACITY[i],
                  }}
                />
              ))}
              {100 - summaryPct > 0.01 && (
                <button
                  type="button"
                  title={`All other tables · ${formatSizeMb(dist.totalMb - summary.reduce((s, r) => s + r.sizeMb, 0))}`}
                  onClick={() => {
                    setExpanded(true);
                    setQuery("");
                  }}
                  className="h-full bg-muted-foreground/30 hover:bg-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ width: `${100 - summaryPct}%` }}
                />
              )}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${allRows.length} ${allRows.length === 1 ? "table" : "tables"}…`}
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring select-text"
            />
          </div>

          {searching ? (
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {matches.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground">
                  No tables match “{query.trim()}”
                </div>
              ) : (
                matches.map((row) => renderRow(row, dist.other.includes(row)))
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {dist.top.map((row) => renderRow(row))}

              {dist.other.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="grid w-full grid-cols-[minmax(0,10rem)_1fr_5.5rem_3rem] sm:grid-cols-[minmax(0,14rem)_1fr_6.5rem_3.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                      />
                      Other ({dist.other.length}{" "}
                      {dist.other.length === 1 ? "table" : "tables"})
                    </span>
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-muted-foreground/50"
                        style={{
                          width: `${maxMb > 0 ? Math.max((dist.otherMb / maxMb) * 100, dist.otherMb > 0 ? 1 : 0, 0) : 0}%`,
                          maxWidth: "100%",
                        }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-foreground">
                      {formatSizeMb(dist.otherMb)}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {formatPct(dist.otherPct)}
                    </span>
                  </button>

                  {expanded && (
                    <div className="ml-4 max-h-72 space-y-0.5 overflow-y-auto border-l border-border pl-2">
                      {dist.other.map((row) => renderRow(row, true))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            {dist.other.length > 0 ? (
              <span>
                Showing the {dist.top.length} largest{" "}
                {dist.top.length === 1 ? "table" : "tables"}; smaller ones are
                grouped under Other.
              </span>
            ) : (
              <span>All {dist.top.length} tables shown</span>
            )}
            {dist.unknown.length > 0 && (
              <span>
                {dist.unknown.length}{" "}
                {dist.unknown.length === 1 ? "table/view" : "tables/views"}{" "}
                without size data
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
