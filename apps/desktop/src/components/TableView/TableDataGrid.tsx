import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from 'motion/react';
import {
  Key,
  Link,
  ArrowUp,
  ArrowDown,
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
import {
  formatCellValue,
  isSetColumnDefault,
  SET_COLUMN_DEFAULT,
} from "../../lib/pendingChanges";
import {
  foreignKeyPreviewSql,
  resolveReferencedTable,
} from "../../lib/foreignKeyLookup";
import {
  activeFilters,
  applyTableView,
  createDefaultFilter,
  filtersKey,
} from "../../lib/tableFilters";
import { shortColumnType } from "../../lib/columnTypeDisplay";
import {
  canSetDefault,
  canSetEmpty,
  canSetNull,
  cellClipboardText,
  filterFromCell,
  numericFilterOps,
  tableFooterRange,
  truncateLabel,
  type CellFilterOp,
} from "../../lib/tableCellActions";
import { copyExport, DATA_EXPORT_FORMATS } from "../../lib/dataExport";
import { toast } from "../../lib/toast";
import { FORMAT_ICONS } from "../DataExport/DataExportMenu";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { Select, SelectOption } from "../ui/Select";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import {
  GRID_ROW_HEIGHT,
  GRID_SELECT_COLUMN_WIDTH,
  columnOffsets,
  fitColumnWidths,
} from "../../lib/gridWindow";
import {
  editingCellWidth,
  estimateColumnWidths,
} from "../../lib/gridColumnWidths";
import {
  GridRow,
  ROW_STYLE,
  SPACER_CELL,
  type CellMenuTarget,
  type GridRowActions,
} from "./GridRow";
import {
  useElementWidth,
  useGridWindow,
  useMonoCharWidth,
} from "./useGridWindow";

const HEADER_SPACER = "p-0 border-b border-border bg-card";

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
  onLoadRows: (
    limit: number,
    offset: number,
    filters: FilterClause[],
  ) => Promise<void>;
  onLookup: FkLookupFn;
  onOpenTable: (table: TableSchema) => void;
  /**
   * "query" renders a SQL result: no search or filters, and `onLoadRows` loads
   * a page of the query instead of a page of a table.
   */
  variant?: "table" | "query";
  /**
   * The page `rows` already holds. A table grid shows it without fetching
   * again; a query result is paged only when this is set, and shown whole
   * (no pagination footer) otherwise.
   */
  pagination?: { pageSize: number; offset: number; filters?: FilterClause[] };
  /**
   * How many rows match the active filters, once the database has counted
   * them. Unset, the table's own row count is used.
   */
  matchCount?: number;
  /** Fetches every row of the table or query; Copy and Export use it unless rows are selected. */
  onFetchAllRows?: () => Promise<Record<string, unknown>[]>;
  /** Disables selection, editing, inserting and deleting. */
  readOnly?: boolean;
  readOnlyReason?: string;
  /** Result columns that cannot be edited (aliases, expressions). */
  readOnlyColumns?: ReadonlySet<string>;
  /** Table that Add Row inserts into when `table` is only a projection of it. */
  insertTable?: TableSchema;
  toolbarLeading?: React.ReactNode;
  toolbarTrailing?: React.ReactNode;
}

interface GridContextMenu {
  kind: "cell" | "header";
  x: number;
  y: number;
  column: ColumnDefinition;
  rowPk?: unknown;
  rawValue?: unknown;
  displayValue?: unknown;
  row?: Record<string, unknown>;
  isPendingDelete?: boolean;
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
  variant = "table",
  pagination,
  matchCount,
  onFetchAllRows,
  readOnly = false,
  readOnlyReason,
  readOnlyColumns,
  insertTable,
  toolbarLeading,
  toolbarTrailing,
}) => {
  const isQuery = variant === "query";
  const paged = !isQuery || pagination !== undefined;
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedValue(searchInput);
  const [filters, setFilters] = useState<FilterClause[]>(
    () => pagination?.filters ?? [],
  );
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
  // Filters run in the database, so a rule edit refetches (debounced while typing).
  const completeFilters = useMemo(() => activeFilters(filters), [filters]);
  const appliedFilters = useDebouncedValue(completeFilters);
  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;
  const appliedKey = useMemo(() => filtersKey(appliedFilters), [appliedFilters]);
  // A different set of filters is a different result: back to its first page.
  const [pageState, setPageState] = useState(() => ({
    page: pagination ? Math.floor(pagination.offset / pagination.pageSize) + 1 : 1,
    filterKey: appliedKey,
  }));
  const page = pageState.filterKey === appliedKey ? pageState.page : 1;
  const setPage = (next: number) =>
    setPageState({ page: next, filterKey: appliedKey });
  const [pageSize, setPageSize] = useState(
    pagination?.pageSize ?? DEFAULT_PAGE_SIZE,
  );
  const [insertOpen, setInsertOpen] = useState(false);
  const [pendingLoad, setPendingLoad] = useState(false);
  const [fkFloater, setFkFloater] = useState<ForeignKeyFloaterState | null>(
    null,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<GridContextMenu | null>(null);
  const fkLookupGen = useRef(0);
  const loading = isLoading || pendingLoad;
  const visibleColumns = useMemo(
    () => table.columns.filter((col) => !hiddenColumns.includes(col.name)),
    [table.columns, hiddenColumns],
  );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const isCellLocked = (columnName: string) =>
    readOnly || Boolean(readOnlyColumns?.has(columnName));
  const dataColSpan = visibleColumns.length + (readOnly ? 0 : 1);
  const leadingWidth = readOnly ? 0 : GRID_SELECT_COLUMN_WIDTH;
  const portRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const onLoadRowsRef = useRef(onLoadRows);
  onLoadRowsRef.current = onLoadRows;

  const pkCol = table.columns.find((c) => c.isPrimary)?.name || "id";
  const totalRows =
    appliedFilters.length > 0 && matchCount !== undefined
      ? matchCount
      : table.rowCount;
  const pageCount = Math.max(1, Math.ceil((totalRows || 0) / pageSize));
  const safePage = Math.min(page, pageCount);

  // Rows handed in with `pagination` are already loaded; only a different page is fetched.
  const loadedPage = useRef(
    pagination ? `${table.id}:${pageSize}:${safePage}:${appliedKey}` : null,
  );

  useEffect(() => {
    if (!paged) return;
    const key = `${table.id}:${pageSize}:${safePage}:${appliedKey}`;
    if (loadedPage.current === key) return;
    loadedPage.current = key;
    let cancelled = false;
    void onLoadRowsRef
      .current(pageSize, (safePage - 1) * pageSize, appliedFiltersRef.current)
      .finally(() => {
        if (!cancelled) setPendingLoad(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageSize, safePage, table.id, paged, appliedKey]);

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

  // Filter & Search processing. Memoised: scrolling re-renders this component.
  const filteredRows = useMemo(
    () => applyTableView(rows, { searchTerm, sort }),
    [rows, searchTerm, sort],
  );

  const selectedPkSet = useMemo(
    () => new Set<unknown>(selectedRowPks),
    [selectedRowPks],
  );
  const pendingByRow = useMemo(() => {
    const byRow = new Map<
      string,
      Record<string, (typeof pendingModifications.updates)[number]>
    >();
    for (const update of pendingModifications.updates) {
      const pk = String(update.primaryKeyValue);
      let cells = byRow.get(pk);
      if (!cells) byRow.set(pk, (cells = {}));
      if (!cells[update.columnName]) cells[update.columnName] = update;
    }
    return byRow;
  }, [pendingModifications.updates]);
  const pendingDeletePks = useMemo(
    () =>
      new Set(pendingModifications.deletes.map((d) => String(d.primaryKeyValue))),
    [pendingModifications.deletes],
  );

  const exportRows = useMemo(
    () =>
      selectedPkSet.size > 0
        ? filteredRows.filter((row) => selectedPkSet.has(row[pkCol]))
        : filteredRows,
    [filteredRows, selectedPkSet, pkCol],
  );

  // Only rows and columns near the viewport are mounted, so column widths
  // are computed from the data instead of measured from a full table.
  const charWidth = useMonoCharWidth(tableRef);
  const baseColumnWidths = useMemo(
    () =>
      estimateColumnWidths(visibleColumns, rows, {
        charWidth,
        pending: pendingModifications.updates,
      }),
    [visibleColumns, rows, charWidth, pendingModifications.updates],
  );
  const editingColumn = editingCell?.column;
  const editingText = editingCell?.value ?? "";
  const naturalColumnWidths = useMemo(() => {
    if (editingColumn === undefined) return baseColumnWidths;
    const index = visibleColumns.findIndex((c) => c.name === editingColumn);
    if (index < 0) return baseColumnWidths;
    const widened = [...baseColumnWidths];
    widened[index] = Math.max(
      widened[index],
      editingCellWidth(editingText, charWidth),
    );
    return widened;
  }, [baseColumnWidths, visibleColumns, editingColumn, editingText, charWidth]);

  const portWidth = useElementWidth(portRef);
  const columnWidths = useMemo(
    () => fitColumnWidths(naturalColumnWidths, portWidth - leadingWidth),
    [naturalColumnWidths, portWidth, leadingWidth],
  );
  const offsets = useMemo(() => columnOffsets(columnWidths), [columnWidths]);
  const tableWidth = leadingWidth + offsets[offsets.length - 1];

  const itemCount = filteredRows.length + pendingModifications.inserts.length;
  const range = useGridWindow({
    portRef,
    rowCount: itemCount,
    offsets,
    leadingWidth,
  });
  const colStart = Math.min(range.colStart, visibleColumns.length);
  const colEnd = Math.min(range.colEnd, visibleColumns.length);
  const windowColumns = visibleColumns.slice(colStart, colEnd);
  const leftSpan = colStart;
  const rightSpan = visibleColumns.length - colEnd;
  const dataRowStart = Math.min(range.rowStart, filteredRows.length);
  const dataRowEnd = Math.min(range.rowEnd, filteredRows.length);
  const insertRowStart = Math.max(range.rowStart - filteredRows.length, 0);
  const insertRowEnd = Math.max(range.rowEnd - filteredRows.length, 0);
  const topSpacerHeight = range.rowStart * GRID_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, itemCount - range.rowEnd) * GRID_ROW_HEIGHT;

  const rangeStart = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalRows);

  const handleRefresh = async () => {
    if (loading) return;
    setEditingCell(null);
    setPendingLoad(true);
    try {
      await onLoadRows(pageSize, (safePage - 1) * pageSize, appliedFilters);
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
    filteredRows.every((r) => selectedPkSet.has(r[pkCol]));

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


  const applyCellFilter = (
    columnName: string,
    op: CellFilterOp,
    value: unknown,
  ) => {
    setFilters((prev) => [...prev, filterFromCell(columnName, op, value)]);
    setShowFilters(true);
  };

  const openCellMenu = (event: React.MouseEvent, opts: CellMenuTarget) => {
    event.preventDefault();
    if (editingCell) return;
    setContextMenu({
      kind: "cell",
      x: event.clientX,
      y: event.clientY,
      ...opts,
    });
  };

  const openHeaderMenu = (
    event: React.MouseEvent,
    column: ColumnDefinition,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      kind: "header",
      x: event.clientX,
      y: event.clientY,
      column,
    });
  };

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? contextMenu.kind === "header"
      ? headerMenuItems({
          onSort: (direction) =>
            setSort({ column: contextMenu.column.name, direction }),
          onHide: () =>
            setHiddenColumns((prev) =>
              prev.includes(contextMenu.column.name)
                ? prev
                : [...prev, contextMenu.column.name],
            ),
        })
      : cellMenuItems({
          table,
          column: contextMenu.column,
          displayValue: contextMenu.displayValue,
          rowPk: contextMenu.rowPk,
          row: contextMenu.row ?? {},
          isPendingDelete: Boolean(contextMenu.isPendingDelete),
          locked: isCellLocked(contextMenu.column.name),
          allowFilter: !isQuery,
          pendingModifications,
          onFilter: applyCellFilter,
          onSetValue: (newValue) => {
            if (contextMenu.rowPk === undefined) return;
            onUpdateCell(
              contextMenu.rowPk,
              contextMenu.column.name,
              contextMenu.rawValue,
              newValue,
            );
          },
        })
    : [];

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

  // Rows are memoised, so they get stable callbacks that always call the
  // latest handlers instead of closures that change on every render.
  const latestActions = useRef<GridRowActions>(null as never);
  latestActions.current = {
    toggleSelect: handleToggleRowSelect,
    openCellMenu,
    openJson: (columnName, rowPk, value) =>
      setJsonModalState({ isOpen: true, columnName, rowPk, value }),
    startEdit: (rowPk, column, value) =>
      setEditingCell({ rowPk, column, value }),
    changeEdit: (value) =>
      setEditingCell((prev) => (prev ? { ...prev, value } : prev)),
    submitEdit: handleCellEditSubmit,
    cancelEdit: () => setEditingCell(null),
    openForeignKey: (event, fk, value) =>
      void handleOpenForeignKey(event, fk, value),
  };
  const rowActions = useMemo<GridRowActions>(
    () => ({
      toggleSelect: (pk) => latestActions.current.toggleSelect(pk),
      openCellMenu: (e, t) => latestActions.current.openCellMenu(e, t),
      openJson: (c, pk, v) => latestActions.current.openJson(c, pk, v),
      startEdit: (pk, c, v) => latestActions.current.startEdit(pk, c, v),
      changeEdit: (v) => latestActions.current.changeEdit(v),
      submitEdit: (pk, c, o, n) => latestActions.current.submitEdit(pk, c, o, n),
      cancelEdit: () => latestActions.current.cancelEdit(),
      openForeignKey: (e, fk, v) => latestActions.current.openForeignKey(e, fk, v),
    }),
    [],
  );

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background overflow-hidden font-sans select-none text-foreground">
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
        onSetFilters={setFilters}
        showFilters={showFilters}
        onShowFiltersChange={setShowFilters}
        hiddenColumns={hiddenColumns}
        onHiddenColumnsChange={setHiddenColumns}
        selectedRowsCount={selectedRowPks.length}
        variant={variant}
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        leading={toolbarLeading}
        trailing={toolbarTrailing}
        onInsertRow={() => setInsertOpen(true)}
        onDeleteSelectedRows={() => {
          onDeleteSelectedRows(selectedRowPks);
          setSelectedRowPks([]);
        }}
        exportRows={exportRows}
        fetchAllRows={onFetchAllRows}
        onRefresh={() => {
          void handleRefresh();
        }}
        isLoading={loading}
      />

      {/* Spreadsheet Grid Canvas */}
      <div
        ref={portRef}
        className="flex-1 table-scroll-port"
        aria-busy={loading}
        aria-live="polite"
      >
        <table
          ref={tableRef}
          className="text-left text-xs font-mono"
          style={{ tableLayout: "fixed", width: tableWidth }}
        >
          <colgroup>
            {!readOnly && <col style={{ width: GRID_SELECT_COLUMN_WIDTH }} />}
            {visibleColumns.map((col, i) => (
              <col key={col.name} style={{ width: columnWidths[i] }} />
            ))}
          </colgroup>
          {/* Header */}
          <thead>
            <tr>
              {/* Checkbox column */}
              {!readOnly && (
                <th className="w-10 px-3 py-2 text-center border-r border-b border-border bg-card">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleToggleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}

              {leftSpan > 0 && <th colSpan={leftSpan} className={HEADER_SPACER} />}

              {/* Data Columns (only those near the viewport are mounted) */}
              {windowColumns.map((col) => {
                const isSorted = sort?.column === col.name;
                return (
                  <th
                    key={col.name}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.button !== 0)
                        return;
                      handleSortToggle(col.name);
                    }}
                    onContextMenu={(event) => openHeaderMenu(event, col)}
                    className="px-3 py-2.5 border-r border-b border-border bg-card font-semibold text-foreground hover:bg-accent cursor-pointer transition-colors whitespace-nowrap"
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
                        {col.type !== "unknown" && (
                          <span
                            className="text-[10px] text-muted-foreground font-normal font-sans"
                            title={col.type}
                          >
                            ({shortColumnType(col.type)})
                          </span>
                        )}
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

              {rightSpan > 0 && (
                <th colSpan={rightSpan} className={HEADER_SPACER} />
              )}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-border bg-background">
            {loading ? (
              <TableSkeletonRows
                columns={windowColumns}
                selectable={!readOnly}
                leftSpan={leftSpan}
                rightSpan={rightSpan}
              />
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <tr aria-hidden style={{ height: topSpacerHeight }}>
                    <td colSpan={dataColSpan} className={SPACER_CELL} />
                  </tr>
                )}

                {filteredRows.slice(dataRowStart, dataRowEnd).map((row, offset) => {
                  const rowPkVal = row[pkCol];
                  return (
                    <GridRow
                      key={(rowPkVal as React.Key | undefined) ?? dataRowStart + offset}
                      row={row}
                      pkCol={pkCol}
                      columns={visibleColumns}
                      colStart={colStart}
                      colEnd={colEnd}
                      readOnly={readOnly}
                      readOnlyColumns={readOnlyColumns}
                      isSelected={selectedPkSet.has(rowPkVal)}
                      isPendingDelete={pendingDeletePks.has(String(rowPkVal))}
                      rowPending={pendingByRow.get(String(rowPkVal))}
                      editing={
                        editingCell && editingCell.rowPk === rowPkVal
                          ? editingCell
                          : null
                      }
                      actions={rowActions}
                    />
                  );
                })}

                {pendingModifications.inserts
                  .slice(insertRowStart, insertRowEnd)
                  .map((insert) => (
                  <tr
                    key={insert.tempId}
                    style={ROW_STYLE}
                    className="bg-emerald-500/10"
                  >
                    {!readOnly && (
                      <td
                        style={ROW_STYLE}
                        className="px-3 py-0 text-center border-r border-border"
                      >
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                          <Plus className="w-3 h-3" />
                          New
                        </span>
                      </td>
                    )}
                    {leftSpan > 0 && (
                      <td colSpan={leftSpan} className={SPACER_CELL} />
                    )}
                    {windowColumns.map((col) => (
                      <td
                        key={col.name}
                        style={ROW_STYLE}
                        className="px-3 py-0 border-r border-border whitespace-nowrap font-mono text-emerald-200"
                      >
                        {insert.data[col.name] === null ||
                        insert.data[col.name] === undefined ? (
                          <span className="text-muted-foreground italic">
                            NULL
                          </span>
                        ) : (
                          formatCellValue(insert.data[col.name])
                        )}
                      </td>
                    ))}
                    {rightSpan > 0 && (
                      <td colSpan={rightSpan} className={SPACER_CELL} />
                    )}
                  </tr>
                ))}

                {bottomSpacerHeight > 0 && (
                  <tr aria-hidden style={{ height: bottomSpacerHeight }}>
                    <td colSpan={dataColSpan} className={SPACER_CELL} />
                  </tr>
                )}

                {filteredRows.length === 0 &&
                  pendingModifications.inserts.length === 0 && (
                    <tr>
                      <td
                        colSpan={dataColSpan}
                        className="py-12 text-center text-muted-foreground font-sans"
                      >
                        {isQuery
                          ? "Query returned 0 rows."
                          : "No records found matching filters or search queries."}
                      </td>
                    </tr>
                  )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!paged && (
        <div className="px-3 py-1.5 bg-card border-t border-border text-xs font-mono text-muted-foreground shrink-0">
          {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
          {selectedRowPks.length > 0 && ` (${selectedRowPks.length} selected)`}
        </div>
      )}

      {/* Grid Bottom Footer: pagination */}
      {paged && (
      <div className="px-3 py-1.5 bg-card border-t border-border text-xs font-mono text-muted-foreground flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 truncate">
          {tableFooterRange({
            rowCount: totalRows,
            rangeStart,
            rangeEnd,
            selectedCount: selectedRowPks.length,
          })}
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
      )}

      <InsertRowDrawer
        isOpen={insertOpen}
        table={insertTable ?? table}
        tables={tables}
        onClose={() => setInsertOpen(false)}
        onInsert={onInsertRow}
        onLookup={onLookup}
      />

      <AnimatePresence>
      {fkFloater && (
        <ForeignKeyFloater
          key="fk-floater"
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
      </AnimatePresence>

      <AnimatePresence>
      {contextMenu && (
        <ContextMenu
          key={`${contextMenu.x}:${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
      </AnimatePresence>

      {/* JSON Inspector Modal */}
      <JsonModal
        isOpen={jsonModalState.isOpen}
        columnName={jsonModalState.columnName}
        initialValue={jsonModalState.value}
        readOnly={isCellLocked(jsonModalState.columnName)}
        onSave={(updatedJson) => {
          if (isCellLocked(jsonModalState.columnName)) return;
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

function TableSkeletonRows({
  columns,
  selectable,
  leftSpan,
  rightSpan,
}: {
  columns: ColumnDefinition[];
  selectable: boolean;
  leftSpan: number;
  rightSpan: number;
}) {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, row) => (
        <tr key={row} aria-hidden>
          {selectable && (
            <td className="w-10 px-3 py-2.5 text-center border-r border-border">
              <span className="table-skeleton-bar inline-block h-3.5 w-3.5 rounded" />
            </td>
          )}
          {leftSpan > 0 && <td colSpan={leftSpan} className={SPACER_CELL} />}
          {columns.map((col, colIdx) => (
            <td key={col.name} className="px-3 py-2.5 border-r border-border">
              <span
                className={`table-skeleton-bar inline-block h-3 max-w-full ${
                  SKELETON_BAR_WIDTHS[
                    (row + colIdx) % SKELETON_BAR_WIDTHS.length
                  ]
                }`}
              />
            </td>
          ))}
          {rightSpan > 0 && <td colSpan={rightSpan} className={SPACER_CELL} />}
        </tr>
      ))}
    </>
  );
}

function quotedFilterValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (isSetColumnDefault(value)) return "DEFAULT";
  const text =
    typeof value === "object" ? cellClipboardText(value) : String(value);
  return `"${truncateLabel(text)}"`;
}

function overlayPendingRow(
  row: Record<string, unknown>,
  rowPk: unknown,
  pending: PendingModifications,
): Record<string, unknown> {
  const next = { ...row };
  for (const cell of pending.updates) {
    if (String(cell.primaryKeyValue) !== String(rowPk)) continue;
    next[cell.columnName] = isSetColumnDefault(cell.newValue)
      ? null
      : cell.newValue;
  }
  return next;
}

function headerMenuItems(actions: {
  onSort: (direction: "ASC" | "DESC") => void;
  onHide: () => void;
}): ContextMenuItem[] {
  return [
    {
      id: "sort-asc",
      label: "Sort Ascending",
      onSelect: () => actions.onSort("ASC"),
    },
    {
      id: "sort-desc",
      label: "Sort Descending",
      onSelect: () => actions.onSort("DESC"),
    },
    {
      id: "hide",
      label: "Hide Column",
      onSelect: actions.onHide,
    },
  ];
}

function cellMenuItems(opts: {
  table: TableSchema;
  column: ColumnDefinition;
  displayValue: unknown;
  rowPk: unknown;
  row: Record<string, unknown>;
  isPendingDelete: boolean;
  locked: boolean;
  allowFilter: boolean;
  pendingModifications: PendingModifications;
  onFilter: (column: string, op: CellFilterOp, value: unknown) => void;
  onSetValue: (value: unknown) => void;
}): ContextMenuItem[] {
  const ctx = {
    isView: Boolean(opts.table.isView) || opts.locked,
    isPendingDelete: opts.isPendingDelete,
  };
  const quoted = quotedFilterValue(opts.displayValue);
  const numeric =
    opts.displayValue !== null &&
    opts.displayValue !== undefined &&
    numericFilterOps(opts.column).length > 0;
  const exportRow = overlayPendingRow(
    opts.row,
    opts.rowPk,
    opts.pendingModifications,
  );
  const exportInput = {
    columns: opts.table.columns.map((column) => column.name),
    rows: [exportRow],
    tableName: opts.table.name,
    schema: opts.table.schema,
  };

  const filterItems: ContextMenuItem[] = [
    {
      id: "eq",
      label: "Equals",
      hint: quoted,
      onSelect: () =>
        opts.onFilter(opts.column.name, "equals", opts.displayValue),
    },
    {
      id: "neq",
      label: "Not equals",
      hint: quoted,
      onSelect: () =>
        opts.onFilter(opts.column.name, "notEquals", opts.displayValue),
    },
    {
      id: "contains",
      label: "Contains",
      hint: quoted,
      disabled: opts.displayValue === null || opts.displayValue === undefined,
      onSelect: () =>
        opts.onFilter(opts.column.name, "contains", opts.displayValue),
    },
  ];
  if (numeric) {
    filterItems.push(
      {
        id: "gt",
        label: "Greater than",
        hint: quoted,
        onSelect: () =>
          opts.onFilter(opts.column.name, "gt", opts.displayValue),
      },
      {
        id: "lt",
        label: "Less than",
        hint: quoted,
        onSelect: () =>
          opts.onFilter(opts.column.name, "lt", opts.displayValue),
      },
    );
  }

  return [
    {
      id: "copy-cell",
      label: "Copy this cell value",
      onSelect: () => {
        void navigator.clipboard
          .writeText(cellClipboardText(opts.displayValue))
          .then(() => toast("Copied cell value"))
          .catch(() => toast.error("Could not copy to clipboard"));
      },
    },
    ...(opts.allowFilter
      ? [
          {
            id: "filter",
            label: "Filter by this column",
            submenu: filterItems,
          },
        ]
      : []),
    {
      id: "set-as",
      label: "Set as",
      disabled: ctx.isView || ctx.isPendingDelete,
      submenu: [
        {
          id: "empty",
          label: "Empty",
          disabled: !canSetEmpty(ctx),
          onSelect: () => opts.onSetValue(""),
        },
        {
          id: "null",
          label: "NULL",
          disabled: !canSetNull(opts.column, ctx),
          onSelect: () => opts.onSetValue(null),
        },
        {
          id: "default",
          label: "Default",
          disabled: !canSetDefault(opts.column, ctx),
          onSelect: () => opts.onSetValue(SET_COLUMN_DEFAULT),
        },
      ],
    },
    {
      id: "copy-row",
      label: "Copy row as",
      submenu: DATA_EXPORT_FORMATS.map((format) => {
        const { icon: Icon, className } = FORMAT_ICONS[format.id];
        return {
          id: format.id,
          label: format.label,
          icon: <Icon className={`w-3.5 h-3.5 shrink-0 ${className}`} />,
          onSelect: () => {
            void copyExport(exportInput, format.id)
              .then(() => toast(`Copied as ${format.label}`))
              .catch(() => toast.error("Could not copy to clipboard"));
          },
        };
      }),
    },
  ];
}
