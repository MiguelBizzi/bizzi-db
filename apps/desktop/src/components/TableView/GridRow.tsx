import React from "react";
import { Code, ExternalLink } from "lucide-react";
import type {
  ColumnDefinition,
  PendingModifications,
} from "../../types";
import { Checkbox } from "../ui/Checkbox";
import { isSetColumnDefault } from "../../lib/pendingChanges";
import { GRID_ROW_HEIGHT } from "../../lib/gridWindow";

export const ROW_STYLE: React.CSSProperties = { height: GRID_ROW_HEIGHT };
export const SPACER_CELL = "p-0 border-0";

type PendingUpdate = PendingModifications["updates"][number];

export interface EditingCell {
  rowPk: unknown;
  column: string;
  value: string;
}

export interface CellMenuTarget {
  column: ColumnDefinition;
  rowPk: unknown;
  rawValue: unknown;
  displayValue: unknown;
  row: Record<string, unknown>;
  isPendingDelete: boolean;
}

/** Stable callbacks, so memoised rows only re-render when their own data changes. */
export interface GridRowActions {
  toggleSelect: (rowPk: unknown) => void;
  openCellMenu: (event: React.MouseEvent, target: CellMenuTarget) => void;
  openJson: (column: string, rowPk: unknown, value: unknown) => void;
  startEdit: (rowPk: unknown, column: string, value: string) => void;
  changeEdit: (value: string) => void;
  submitEdit: (
    rowPk: unknown,
    column: string,
    oldValue: unknown,
    newValue: string,
  ) => void;
  cancelEdit: () => void;
  openForeignKey: (
    event: React.MouseEvent<HTMLButtonElement>,
    fk: NonNullable<ColumnDefinition["foreignKey"]>,
    value: unknown,
  ) => void;
}

interface GridRowProps {
  row: Record<string, unknown>;
  pkCol: string;
  columns: ColumnDefinition[];
  colStart: number;
  colEnd: number;
  readOnly: boolean;
  readOnlyColumns?: ReadonlySet<string>;
  isSelected: boolean;
  isPendingDelete: boolean;
  /** Staged edits for this row, by column; undefined when there are none. */
  rowPending?: Record<string, PendingUpdate>;
  /** The cell being edited, when it belongs to this row. */
  editing: EditingCell | null;
  actions: GridRowActions;
}

function GridRowImpl({
  row,
  pkCol,
  columns,
  colStart,
  colEnd,
  readOnly,
  readOnlyColumns,
  isSelected,
  isPendingDelete,
  rowPending,
  editing,
  actions,
}: GridRowProps) {
  const rowPkVal = row[pkCol];
  const leftSpan = colStart;
  const rightSpan = columns.length - colEnd;

  return (
    <tr
      style={ROW_STYLE}
      className={`hover:bg-accent/50 transition-colors ${
        isPendingDelete ? "bg-rose-500/10" : isSelected ? "bg-primary/10" : ""
      }`}
    >
      {/* Select Checkbox */}
      {!readOnly && (
        <td
          style={ROW_STYLE}
          className="px-3 py-0 text-center border-r border-border"
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => actions.toggleSelect(rowPkVal)}
            aria-label="Select row"
          />
        </td>
      )}

      {leftSpan > 0 && <td colSpan={leftSpan} className={SPACER_CELL} />}

      {/* Cells */}
      {columns.slice(colStart, colEnd).map((col) => {
        const rawVal = row[col.name];
        const pendingUpd = rowPending?.[col.name];
        const isPending = !!pendingUpd;
        const displayVal = isPending ? pendingUpd.newValue : rawVal;
        const isEditing = editing?.column === col.name;
        const isLocked = readOnly || Boolean(readOnlyColumns?.has(col.name));

        const isJson =
          typeof displayVal === "object" &&
          displayVal !== null &&
          !isSetColumnDefault(displayVal);
        const fk = col.foreignKey;

        return (
          <td
            key={col.name}
            style={ROW_STYLE}
            onContextMenu={(event) =>
              actions.openCellMenu(event, {
                column: col,
                rowPk: rowPkVal,
                rawValue: rawVal,
                displayValue: displayVal,
                row,
                isPendingDelete,
              })
            }
            onDoubleClick={() => {
              if (isPendingDelete) return;
              if (isJson) {
                actions.openJson(col.name, rowPkVal, displayVal);
              } else if (!isLocked) {
                actions.startEdit(
                  rowPkVal,
                  col.name,
                  isSetColumnDefault(displayVal) ? "" : String(displayVal ?? ""),
                );
              }
            }}
            className={`border-r border-border whitespace-nowrap font-mono relative transition-colors ${
              isEditing ? "p-0 overflow-hidden" : "px-3 py-0"
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
                  {editing.value || " "}
                </span>
                <input
                  type="text"
                  autoFocus
                  value={editing.value}
                  onChange={(e) => actions.changeEdit(e.target.value)}
                  onBlur={() =>
                    actions.submitEdit(rowPkVal, col.name, rawVal, editing.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      actions.submitEdit(
                        rowPkVal,
                        col.name,
                        rawVal,
                        editing.value,
                      );
                    } else if (e.key === "Escape") {
                      actions.cancelEdit();
                    }
                  }}
                  className="absolute inset-0 box-border w-full h-full bg-background border-2 border-primary rounded-none px-3 py-2 text-xs text-foreground outline-none z-10"
                />
              </>
            ) : isJson ? (
              <button
                onClick={() => actions.openJson(col.name, rowPkVal, displayVal)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-accent text-primary text-[11px] font-mono border border-border"
              >
                <Code className="w-3 h-3 text-primary" />
                <span>{JSON.stringify(displayVal).slice(0, 24)}...</span>
              </button>
            ) : displayVal === null || displayVal === undefined ? (
              <span className="text-muted-foreground italic">NULL</span>
            ) : isSetColumnDefault(displayVal) ? (
              <span className="text-muted-foreground italic">DEFAULT</span>
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
                      actions.openForeignKey(event, fk, displayVal)
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

      {rightSpan > 0 && <td colSpan={rightSpan} className={SPACER_CELL} />}
    </tr>
  );
}

export const GridRow = React.memo(GridRowImpl);
