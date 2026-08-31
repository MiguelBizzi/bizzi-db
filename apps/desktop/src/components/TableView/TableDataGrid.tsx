import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Key,
  Link,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Code,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  TableSchema,
  PendingModifications,
  FilterClause,
  SortClause,
  ColumnDefinition,
} from "../../types";
import { TableToolbar } from "./TableToolbar";
import { Checkbox } from "../ui/Checkbox";
import { JsonModal } from "./JsonModal";
import { InsertRowDrawer } from "./InsertRowDrawer";
import { ForeignKeyFloater } from "./ForeignKeyFloater";
import type { FkLookupFn } from "./ForeignKeyPicker";
import { formatCellValue } from "../../lib/pendingChanges";
import {
  foreignKeyPreviewSql,
  resolveReferencedTable,
} from "../../lib/foreignKeyLookup";
import { createDefaultFilter } from "../../lib/tableFilters";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { Select, SelectOption } from "../ui/Select";

const SKELETON_ROW_COUNT = 8;
const SKELETON_BAR_WIDTHS = [
  "w-[38%]",
  "w-[55%]",
  "w-[46%]",
  "w-[62%]",
  "w-[42%]",
  "w-[70%]",
];

const PAGE_SIZE_OPTIONS: SelectOption[] = [
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "250", label: "250" },
  { value: "500", label: "500" },
  { value: "1000", label: "1,000" },
];

const DEFAULT_PAGE_SIZE = 50;

interface TableDataGridProps {
  table: TableSchema;
  rows: Record<string, any>[];
  isLoading?: boolean;
  pendingModifications: PendingModifications;
  tables: TableSchema[];
  onUpdateCell: (
    primaryKeyValue: any,
    columnName: string,
    oldVal: any,
    newVal: any,
  ) => void;
  onInsertRow: (sql: string) => Promise<{ error?: string }>;
  onDeleteSelectedRows: (selectedRowPkValues: any[]) => void;
  onLoadRows: (limit: number, offset: number) => Promise<void>;
  onLookup: FkLookupFn;
  onOpenTable: (table: TableSchema) => void;
}

interface ForeignKeyFloaterState {
  targetTableName: string;
  targetColumn: string;
  value: unknown;
  anchor: DOMRect;
  loading: boolean;
  error?: string;
  table?: TableSchema;
  row: Record<string, unknown> | null;
}

export const TableDataGrid: React.FC<TableDataGridProps> = ({
  table,
  rows,
  isLoading = false,
  pendingModifications,
  tables,
  onUpdateCell,
  onInsertRow,
  onDeleteSelectedRows,
  onLoadRows,
  onLookup,
  onOpenTable,
}) => {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedValue(searchInput);
  const [filters, setFilters] = useState<FilterClause[]>([]);
  const [sort, setSort] = useState<SortClause | null>(null);
  const [selectedRowPks, setSelectedRowPks] = useState<any[]>([]);
  const [editingCell, setEditingCell] = useState<{
    rowPk: any;
    column: string;
    value: string;
  } | null>(null);
  const [jsonModalState, setJsonModalState] = useState<{
    isOpen: boolean;
    columnName: string;
    rowPk: any;
    value: any;
  }>({ isOpen: false, columnName: "", rowPk: null, value: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [insertOpen, setInsertOpen] = useState(false);
  const [pendingLoad, setPendingLoad] = useState(false);
  const [fkFloater, setFkFloater] = useState<ForeignKeyFloaterState | null>(
    null,
  );
  const fkLookupGen = useRef(0);
  const loading = isLoading || pendingLoad;

  const onLoadRowsRef = useRef(onLoadRows);
  onLoadRowsRef.current = onLoadRows;

  const pkCol = table.columns.find((c) => c.isPrimary)?.name || "id";
  const pageCount = Math.max(1, Math.ceil((table.rowCount || 0) / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    let cancelled = false;
    void onLoadRowsRef.current(pageSize, (safePage - 1) * pageSize).finally(() => {
      if (!cancelled) setPendingLoad(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pageSize, safePage, table.id]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // Sort toggle handler
  const handleSortToggle = (colName: string) => {
    if (loading) return;
    if (sort?.column === colName) {
      if (sort.direction === "ASC") {
        setSort({ column: colName, direction: "DESC" });
      } else {
        setSort(null);
      }
    } else {
      setSort({ column: colName, direction: "ASC" });
    }
  };

  // Filter & Search processing
  let filteredRows = [...rows];

  if (searchTerm) {
    filteredRows = filteredRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    );
  }

  filters.forEach((f) => {
    if (!f.enabled || !f.value) return;
    filteredRows = filteredRows.filter((row) => {
      const cellVal = String(row[f.column] ?? "").toLowerCase();
      const targetVal = f.value.toLowerCase();
      switch (f.operator) {
        case "=":
          return cellVal === targetVal;
        case "!=":
          return cellVal !== targetVal;
        case "LIKE":
        case "ILIKE":
          return cellVal.includes(targetVal);
        case ">":
          return Number(cellVal) > Number(targetVal);
        case "<":
          return Number(cellVal) < Number(targetVal);
        default:
          return true;
      }
    });
  });

  if (sort) {
    filteredRows.sort((a, b) => {
      const valA = a[sort.column];
      const valB = b[sort.column];
      if (valA < valB) return sort.direction === "ASC" ? -1 : 1;
      if (valA > valB) return sort.direction === "ASC" ? 1 : -1;
      return 0;
    });
  }

  const exportRows =
    selectedRowPks.length > 0
      ? filteredRows.filter((row) => selectedRowPks.includes(row[pkCol]))
      : filteredRows;

  const rangeStart =
    table.rowCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, table.rowCount);

  const handleRefresh = async () => {
    if (loading) return;
    setEditingCell(null);
    setPendingLoad(true);
    try {
      await onLoadRows(pageSize, (safePage - 1) * pageSize);
    } finally {
      setPendingLoad(false);
    }
  };

  const goToPage = (next: number) => {
    if (next === page) return;
    setPendingLoad(true);
    setPage(next);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPendingLoad(true);
    setPageSize(nextSize);
    setPage(1);
  };

  // Checkbox row select all
  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedRowPks.includes(r[pkCol]));

  const handleToggleSelectAll = () => {
    if (loading) return;
    if (allSelected) {
      setSelectedRowPks([]);
    } else {
      setSelectedRowPks(filteredRows.map((r) => r[pkCol]));
    }
  };

  const handleToggleRowSelect = (pkVal: any) => {
    if (selectedRowPks.includes(pkVal)) {
      setSelectedRowPks(selectedRowPks.filter((id) => id !== pkVal));
    } else {
      setSelectedRowPks([...selectedRowPks, pkVal]);
    }
  };

  // Inline edit submit
  const handleCellEditSubmit = (
    rowPk: any,
    colName: string,
    oldVal: any,
    newValStr: string,
  ) => {
    setEditingCell(null);
    if (String(oldVal) !== newValStr) {
      onUpdateCell(rowPk, colName, oldVal, newValStr);
    }
  };

  // Helper to check if a cell is pending update
  const getCellPendingUpdate = (rowPk: any, colName: string) => {
    return pendingModifications.updates.find(
      (u) =>
        String(u.primaryKeyValue) === String(rowPk) && u.columnName === colName,
    );
  };

  const closeFkFloater = useCallback(() => {
    fkLookupGen.current += 1;
    setFkFloater(null);
  }, []);

  const handleOpenForeignKey = async (
    event: React.MouseEvent<HTMLButtonElement>,
    fk: NonNullable<ColumnDefinition["foreignKey"]>,
    value: unknown,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const gen = ++fkLookupGen.current;
    const target = resolveReferencedTable(tables, table, fk);
    setFkFloater({
      targetTableName: fk.targetTable,
      targetColumn: fk.targetColumn,
      value,
      anchor: event.currentTarget.getBoundingClientRect(),
      loading: true,
      table: target,
      row: null,
    });
    if (!target) {
      if (fkLookupGen.current !== gen) return;
      setFkFloater((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: `Table ${fk.targetTable} not found in the current schema.`,
            }
          : null,
      );
      return;
    }
    try {
      const res = await onLookup(
        foreignKeyPreviewSql(target, fk.targetColumn, value),
      );
      if (fkLookupGen.current !== gen) return;
      if (res.error) {
        setFkFloater((prev) =>
          prev ? { ...prev, loading: false, error: res.error } : null,
        );
        return;
      }
      const row =
        (res.rows?.[0] as Record<string, unknown> | undefined) ?? null;
      setFkFloater((prev) =>
        prev ? { ...prev, loading: false, row, error: undefined } : null,
      );
    } catch (e: unknown) {
      if (fkLookupGen.current !== gen) return;
      setFkFloater((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error:
                e instanceof Error
                  ? e.message
                  : "Failed to load referenced row",
            }
          : null,
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      {/* Toolbar */}
      <TableToolbar
        table={table}
        searchTerm={searchInput}
        onSearchChange={setSearchInput}
        filters={filters}
        onAddFilter={() =>
          setFilters([
            ...filters,
            createDefaultFilter(table.columns[0]?.name || "id"),
          ])
        }
        onRemoveFilter={(id) => setFilters(filters.filter((f) => f.id !== id))}
        onUpdateFilter={(id, field, val) =>
          setFilters(
            filters.map((f) => (f.id === id ? { ...f, [field]: val } : f)),
          )
        }
        selectedRowsCount={selectedRowPks.length}
        onInsertRow={() => setInsertOpen(true)}
        onDeleteSelectedRows={() => {
          onDeleteSelectedRows(selectedRowPks);
          setSelectedRowPks([]);
        }}
        exportRows={exportRows}
        onRefresh={() => {
          void handleRefresh();
        }}
        isLoading={loading}
      />

      {/* Spreadsheet Grid Canvas */}
      <div
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-muted"
        aria-busy={loading}
        aria-live="polite"
      >
        <table className="w-full text-left border-collapse text-xs font-mono">
          {/* Header */}
          <thead className="bg-card border-b border-border sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Checkbox column */}
              <th className="w-10 px-3 py-2 text-center border-r border-border bg-card">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleToggleSelectAll}
                  aria-label="Select all rows"
                />
              </th>

              {/* Data Columns */}
              {table.columns.map((col) => {
                const isSorted = sort?.column === col.name;
                return (
                  <th
                    key={col.name}
                    onClick={() => handleSortToggle(col.name)}
                    className="px-3 py-2.5 border-r border-border font-semibold text-foreground hover:bg-accent cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {col.isPrimary && (
                          <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        {col.foreignKey && (
                          <Link className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                        <span className="truncate">{col.name}</span>
                        <span className="text-[10px] text-muted-foreground font-normal font-sans">
                          ({col.type})
                        </span>
                      </div>

                      {/* Sort Icon */}
                      <div className="text-muted-foreground shrink-0">
                        {isSorted ? (
                          sort?.direction === "ASC" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-primary" />
                          )
                        ) : null}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-border bg-background">
            {loading ? (
              <TableSkeletonRows columns={table.columns} />
            ) : (
              <>
            {filteredRows.map((row, idx) => {
              const rowPkVal = row[pkCol];
              const isSelected = selectedRowPks.includes(rowPkVal);
              const isPendingDelete = pendingModifications.deletes.some(
                (d) => String(d.primaryKeyValue) === String(rowPkVal),
              );

              return (
                <tr
                  key={rowPkVal ?? idx}
                  className={`hover:bg-accent/50 transition-colors ${
                    isPendingDelete
                      ? "bg-rose-500/10"
                      : isSelected
                        ? "bg-primary/10"
                        : ""
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="px-3 py-2 text-center border-r border-border">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleRowSelect(rowPkVal)}
                      aria-label="Select row"
                    />
                  </td>

                  {/* Cells */}
                  {table.columns.map((col) => {
                    const rawVal = row[col.name];
                    const pendingUpd = getCellPendingUpdate(rowPkVal, col.name);
                    const isPending = !!pendingUpd;
                    const displayVal = isPending ? pendingUpd.newValue : rawVal;

                    const isEditing =
                      editingCell?.rowPk === rowPkVal &&
                      editingCell?.column === col.name;

                    const isJson =
                      typeof displayVal === "object" && displayVal !== null;
                    const fk = col.foreignKey;

                    return (
                      <td
                        key={col.name}
                        onDoubleClick={() => {
                          if (isPendingDelete) return;
                          if (isJson) {
                            setJsonModalState({
                              isOpen: true,
                              columnName: col.name,
                              rowPk: rowPkVal,
                              value: displayVal,
                            });
                          } else {
                            setEditingCell({
                              rowPk: rowPkVal,
                              column: col.name,
                              value: String(displayVal ?? ""),
                            });
                          }
                        }}
                        className={`border-r border-border whitespace-nowrap font-mono relative transition-colors ${
                          isEditing ? "p-0 overflow-hidden" : "px-3 py-2"
                        } ${
                          isPendingDelete
                            ? "text-rose-300/80 line-through"
                            : isPending
                              ? "bg-amber-500/10 text-amber-200 font-semibold"
                              : "text-foreground"
                        }`}
                      >
                        {/* Cell Contents */}
                        {isEditing ? (
                          <>
                            <span className="invisible px-3 py-2 pointer-events-none">
                              {editingCell.value || " "}
                            </span>
                            <input
                              type="text"
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell({
                                  ...editingCell,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() =>
                                handleCellEditSubmit(
                                  rowPkVal,
                                  col.name,
                                  rawVal,
                                  editingCell.value,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleCellEditSubmit(
                                    rowPkVal,
                                    col.name,
                                    rawVal,
                                    editingCell.value,
                                  );
                                } else if (e.key === "Escape") {
                                  setEditingCell(null);
                                }
                              }}
                              className="absolute inset-0 box-border w-full h-full bg-background border-2 border-primary rounded-none px-3 py-2 text-xs text-foreground outline-none z-10"
                            />
                          </>
                        ) : isJson ? (
                          <button
                            onClick={() =>
                              setJsonModalState({
                                isOpen: true,
                                columnName: col.name,
                                rowPk: rowPkVal,
                                value: displayVal,
                              })
                            }
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-accent text-primary text-[11px] font-mono border border-border"
                          >
                            <Code className="w-3 h-3 text-primary" />
                            <span>
                              {JSON.stringify(displayVal).slice(0, 24)}...
                            </span>
                          </button>
                        ) : displayVal === null || displayVal === undefined ? (
                          <span className="text-muted-foreground italic">
                            NULL
                          </span>
                        ) : typeof displayVal === "boolean" ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              displayVal
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {displayVal ? "TRUE" : "FALSE"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span>{String(displayVal)}</span>
                            {fk && (
                              <button
                                type="button"
                                title={`View ${fk.targetTable}.${fk.targetColumn}`}
                                aria-label={`Look up ${fk.targetTable} row`}
                                onClick={(event) =>
                                  void handleOpenForeignKey(event, fk, displayVal)
                                }
                                onDoubleClick={(event) => event.stopPropagation()}
                                className="p-0.5 rounded hover:bg-primary/15 text-primary shrink-0"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}

                        {/* Pending Edit Badge indicator */}
                        {isPending && (
                          <span
                            title={`Original: ${pendingUpd.oldValue}`}
                            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {pendingModifications.inserts.map((insert) => (
              <tr key={insert.tempId} className="bg-emerald-500/10">
                <td className="px-3 py-2 text-center border-r border-border">
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                    <Plus className="w-3 h-3" />
                    New
                  </span>
                </td>
                {table.columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-3 py-2 border-r border-border whitespace-nowrap font-mono text-emerald-200"
                  >
                    {insert.data[col.name] === null ||
                    insert.data[col.name] === undefined ? (
                      <span className="text-muted-foreground italic">NULL</span>
                    ) : (
                      formatCellValue(insert.data[col.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}

            {filteredRows.length === 0 &&
              pendingModifications.inserts.length === 0 && (
                <tr>
                  <td
                    colSpan={table.columns.length + 1}
                    className="py-12 text-center text-muted-foreground font-sans"
                  >
                    No records found matching filters or search queries.
                  </td>
                </tr>
              )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Bottom Footer: pagination */}
      <div className="px-3 py-1.5 bg-card border-t border-border text-xs font-mono text-muted-foreground flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 truncate">
          {table.rowCount === 0
            ? "No rows"
            : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${table.rowCount.toLocaleString()}`}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] hidden sm:inline">Rows</span>
            <Select
              size="sm"
              placement="top"
              className="w-[4.75rem]"
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS}
              onChange={(value) => handlePageSizeChange(Number(value))}
              aria-label="Rows per page"
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={safePage <= 1 || loading}
              title="First page"
              aria-label="First page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1 || loading}
              title="Previous page"
              aria-label="Previous page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] text-foreground tabular-nums whitespace-nowrap">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(Math.min(pageCount, safePage + 1))}
              disabled={safePage >= pageCount || loading}
              title="Next page"
              aria-label="Next page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goToPage(pageCount)}
              disabled={safePage >= pageCount || loading}
              title="Last page"
              aria-label="Last page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <InsertRowDrawer
        isOpen={insertOpen}
        table={table}
        tables={tables}
        onClose={() => setInsertOpen(false)}
        onInsert={onInsertRow}
        onLookup={onLookup}
      />

      {fkFloater && (
        <ForeignKeyFloater
          anchor={fkFloater.anchor}
          targetTableName={fkFloater.targetTableName}
          targetColumn={fkFloater.targetColumn}
          value={fkFloater.value}
          loading={fkFloater.loading}
          error={fkFloater.error}
          table={fkFloater.table}
          row={fkFloater.row}
          onClose={closeFkFloater}
          onNavigate={(target) => {
            closeFkFloater();
            onOpenTable(target);
          }}
        />
      )}

      {/* JSON Inspector Modal */}
      <JsonModal
        isOpen={jsonModalState.isOpen}
        columnName={jsonModalState.columnName}
        initialValue={jsonModalState.value}
        onSave={(updatedJson) => {
          onUpdateCell(
            jsonModalState.rowPk,
            jsonModalState.columnName,
            jsonModalState.value,
            updatedJson,
          );
        }}
        onClose={() => setJsonModalState({ ...jsonModalState, isOpen: false })}
      />
    </div>
  );
};

function TableSkeletonRows({ columns }: { columns: ColumnDefinition[] }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, row) => (
        <tr key={row} aria-hidden>
          <td className="w-10 px-3 py-2.5 text-center border-r border-border">
            <span className="table-skeleton-bar inline-block h-3.5 w-3.5 rounded" />
          </td>
          {columns.map((col, colIdx) => (
            <td key={col.name} className="px-3 py-2.5 border-r border-border">
              <span
                className={`table-skeleton-bar inline-block h-3 max-w-full ${
                  SKELETON_BAR_WIDTHS[(row + colIdx) % SKELETON_BAR_WIDTHS.length]
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
