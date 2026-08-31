import React, { useState } from 'react';
import {
  Key,
  Link,
  ArrowUp,
  ArrowDown,
  Check,
  Edit2,
  Code,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  TableSchema,
  PendingModifications,
  FilterClause,
  SortClause,
} from '../../types';
import { TableToolbar } from './TableToolbar';
import { Checkbox } from '../ui/Checkbox';
import { JsonModal } from './JsonModal';

interface TableDataGridProps {
  table: TableSchema;
  rows: Record<string, any>[];
  pendingModifications: PendingModifications;
  onUpdateCell: (
    primaryKeyValue: any,
    columnName: string,
    oldVal: any,
    newVal: any
  ) => void;
  onInsertRow: () => void;
  onDeleteSelectedRows: (selectedRowPkValues: any[]) => void;
  onCommitChanges: () => void;
  onRollbackChanges: () => void;
  onOpenSqlDiffModal: () => void;
  onExport: (format: 'csv' | 'json' | 'markdown' | 'sql') => void;
}

export const TableDataGrid: React.FC<TableDataGridProps> = ({
  table,
  rows,
  pendingModifications,
  onUpdateCell,
  onInsertRow,
  onDeleteSelectedRows,
  onCommitChanges,
  onRollbackChanges,
  onOpenSqlDiffModal,
  onExport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
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
  }>({ isOpen: false, columnName: '', rowPk: null, value: null });
  const [limit, setLimit] = useState(100);

  const pkCol = table.columns.find((c) => c.isPrimary)?.name || 'id';

  // Sort toggle handler
  const handleSortToggle = (colName: string) => {
    if (sort?.column === colName) {
      if (sort.direction === 'ASC') {
        setSort({ column: colName, direction: 'DESC' });
      } else {
        setSort(null);
      }
    } else {
      setSort({ column: colName, direction: 'ASC' });
    }
  };

  // Filter & Search processing
  let filteredRows = [...rows];

  if (searchTerm) {
    filteredRows = filteredRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '')
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
    );
  }

  filters.forEach((f) => {
    if (!f.enabled || !f.value) return;
    filteredRows = filteredRows.filter((row) => {
      const cellVal = String(row[f.column] ?? '').toLowerCase();
      const targetVal = f.value.toLowerCase();
      switch (f.operator) {
        case '=':
          return cellVal === targetVal;
        case '!=':
          return cellVal !== targetVal;
        case 'LIKE':
        case 'ILIKE':
          return cellVal.includes(targetVal);
        case '>':
          return Number(cellVal) > Number(targetVal);
        case '<':
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
      if (valA < valB) return sort.direction === 'ASC' ? -1 : 1;
      if (valA > valB) return sort.direction === 'ASC' ? 1 : -1;
      return 0;
    });
  }

  filteredRows = filteredRows.slice(0, limit);

  // Checkbox row select all
  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedRowPks.includes(r[pkCol]));

  const handleToggleSelectAll = () => {
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
    newValStr: string
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
        String(u.primaryKeyValue) === String(rowPk) && u.columnName === colName
    );
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      {/* Toolbar */}
      <TableToolbar
        table={table}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filters={filters}
        onAddFilter={() =>
          setFilters([
            ...filters,
            {
              id: 'f_' + Date.now(),
              column: table.columns[0]?.name || 'id',
              operator: '=',
              value: '',
              enabled: true,
            },
          ])
        }
        onRemoveFilter={(id) => setFilters(filters.filter((f) => f.id !== id))}
        onUpdateFilter={(id, field, val) =>
          setFilters(
            filters.map((f) => (f.id === id ? { ...f, [field]: val } : f))
          )
        }
        selectedRowsCount={selectedRowPks.length}
        onInsertRow={onInsertRow}
        onDeleteSelectedRows={() => {
          onDeleteSelectedRows(selectedRowPks);
          setSelectedRowPks([]);
        }}
        pendingModifications={pendingModifications}
        onCommitChanges={onCommitChanges}
        onRollbackChanges={onRollbackChanges}
        onOpenSqlDiffModal={onOpenSqlDiffModal}
        onExport={onExport}
        limit={limit}
        onLimitChange={setLimit}
      />

      {/* Spreadsheet Grid Canvas */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-muted">
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
                          sort?.direction === 'ASC' ? (
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
            {filteredRows.map((row, idx) => {
              const rowPkVal = row[pkCol];
              const isSelected = selectedRowPks.includes(rowPkVal);

              return (
                <tr
                  key={rowPkVal ?? idx}
                  className={`hover:bg-accent/50 transition-colors ${
                    isSelected ? 'bg-primary/10' : ''
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
                      typeof displayVal === 'object' && displayVal !== null;

                    return (
                      <td
                        key={col.name}
                        onDoubleClick={() => {
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
                              value: String(displayVal ?? ''),
                            });
                          }
                        }}
                        className={`px-3 py-2 border-r border-border whitespace-nowrap font-mono relative transition-colors ${
                          isPending
                            ? 'bg-amber-500/10 text-amber-200 font-semibold'
                            : 'text-foreground'
                        }`}
                      >
                        {/* Cell Contents */}
                        {isEditing ? (
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
                                editingCell.value
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleCellEditSubmit(
                                  rowPkVal,
                                  col.name,
                                  rawVal,
                                  editingCell.value
                                );
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                              }
                            }}
                            className="w-full bg-card border border-primary px-1.5 py-0.5 rounded text-xs text-foreground focus:outline-none"
                          />
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
                            <span>{JSON.stringify(displayVal).slice(0, 24)}...</span>
                          </button>
                        ) : displayVal === null || displayVal === undefined ? (
                          <span className="text-muted-foreground italic">NULL</span>
                        ) : typeof displayVal === 'boolean' ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              displayVal
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {displayVal ? 'TRUE' : 'FALSE'}
                          </span>
                        ) : (
                          <span>{String(displayVal)}</span>
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

            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={table.columns.length + 1}
                  className="py-12 text-center text-muted-foreground font-sans"
                >
                  No records found matching filters or search queries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Bottom Footer Status Bar */}
      <div className="px-4 py-2 bg-card border-t border-border text-xs font-mono text-muted-foreground flex items-center justify-between shrink-0">
        <div>
          Showing {filteredRows.length.toLocaleString()} of{' '}
          {table.rowCount.toLocaleString()} rows • Latency: 12.4ms
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Double-click cell to edit</span>
          <span>•</span>
          <span className="text-muted-foreground">Shift+Click header to sort</span>
        </div>
      </div>

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
            updatedJson
          );
        }}
        onClose={() =>
          setJsonModalState({ ...jsonModalState, isOpen: false })
        }
      />
    </div>
  );
};
