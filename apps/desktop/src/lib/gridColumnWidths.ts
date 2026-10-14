import type { ColumnDefinition } from "../types";
import { shortColumnType } from "./columnTypeDisplay";
import { isSetColumnDefault } from "./pendingChanges";

/** px-3 on both sides plus the 1px right border. */
export const CELL_PADDING_X = 25;

const FK_BUTTON_WIDTH = 24;
const BADGE_CHROME = 14;
const JSON_BUTTON_CHROME = 34;
/** `{...}` previews are cut at 24 characters and suffixed with "...". */
const JSON_PREVIEW_CHARS = 27;
const HEADER_ICON_WIDTH = 20;
const HEADER_SORT_WIDTH = 22;
const HEADER_TYPE_CHAR_WIDTH = 5.6;
const SAFETY = 2;

const NARROW_ONLY = /^[\u0000-ჿ]*$/;

/**
 * Monospace cells a string occupies: wide (CJK, emoji) characters take two.
 * The grid is monospace, so this is what lets column widths be computed
 * without laying every cell out.
 */
export function cellTextUnits(text: string): number {
  if (NARROW_ONLY.test(text)) return text.length;
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) continue; // low surrogate, counted with its pair
    if (
      (code >= 0xd800 && code <= 0xdbff) ||
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      units += 2;
    } else {
      units += 1;
    }
  }
  return units;
}

export interface PendingCellText {
  columnName: string;
  newValue: unknown;
}

export interface ColumnWidthOptions {
  /** Width of one monospace character at the grid's 12px size. */
  charWidth: number;
  /** Staged edits: their new value can be wider than anything loaded. */
  pending: readonly PendingCellText[];
}

function valueWidth(value: unknown, charWidth: number, hasForeignKey: boolean): number {
  if (isSetColumnDefault(value)) return 7 * charWidth;
  if (value === null || value === undefined) return 4 * charWidth;
  if (typeof value === "boolean") {
    return (value ? 4 : 5) * charWidth * (10 / 12) + BADGE_CHROME;
  }
  if (typeof value === "object") {
    return JSON_PREVIEW_CHARS * charWidth * (11 / 12) + JSON_BUTTON_CHROME;
  }
  return (
    cellTextUnits(String(value)) * charWidth +
    (hasForeignKey ? FK_BUTTON_WIDTH : 0)
  );
}

export function headerWidth(column: ColumnDefinition, charWidth: number): number {
  let width = CELL_PADDING_X + HEADER_SORT_WIDTH + SAFETY;
  if (column.isPrimary) width += HEADER_ICON_WIDTH;
  if (column.foreignKey) width += HEADER_ICON_WIDTH;
  width += cellTextUnits(column.name) * charWidth;
  if (column.type !== "unknown") {
    width += 6 + `(${shortColumnType(column.type)})`.length * HEADER_TYPE_CHAR_WIDTH;
  }
  return Math.ceil(width);
}

/** Width a cell needs while its text is being edited. */
export function editingCellWidth(text: string, charWidth: number): number {
  return Math.ceil(cellTextUnits(text || " ") * charWidth + CELL_PADDING_X + SAFETY);
}

/**
 * Fixed column widths for a table that is virtualised: each column fits its
 * header and its widest loaded cell, which is what auto layout would produce
 * if every row were in the DOM.
 */
export function estimateColumnWidths(
  columns: readonly ColumnDefinition[],
  rows: readonly Record<string, unknown>[],
  options: ColumnWidthOptions,
): number[] {
  const { charWidth, pending } = options;
  return columns.map((column) => {
    const hasForeignKey = Boolean(column.foreignKey);
    let widest = 0;
    for (let i = 0; i < rows.length; i++) {
      const width = valueWidth(rows[i][column.name], charWidth, hasForeignKey);
      if (width > widest) widest = width;
    }
    for (const update of pending) {
      if (update.columnName !== column.name) continue;
      widest = Math.max(widest, valueWidth(update.newValue, charWidth, hasForeignKey));
    }
    const cells = Math.ceil(widest + CELL_PADDING_X + SAFETY);
    return Math.max(cells, headerWidth(column, charWidth));
  });
}
