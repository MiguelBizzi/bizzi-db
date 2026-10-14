/** Fixed row pitch of the data grid body. Every cell is pinned to this height. */
export const GRID_ROW_HEIGHT = 36;
/** Sticky header row: py-2.5 around one 16px line, plus its bottom border. */
export const GRID_HEADER_HEIGHT = 37;
/** Leading checkbox column (w-10 + border). */
export const GRID_SELECT_COLUMN_WIDTH = 41;

export const GRID_OVERSCAN_ROWS = 10;
export const GRID_ROW_QUANTUM = 8;
export const GRID_COL_QUANTUM = 4;
export const GRID_OVERSCAN_PX = 600;

/** Half-open index ranges: `[rowStart, rowEnd)` and `[colStart, colEnd)`. */
export interface GridRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface GridWindowInput {
  scrollTop: number;
  scrollLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  rowCount: number;
  rowHeight: number;
  headerHeight: number;
  /** Width of fixed columns that sit left of the data columns. */
  leadingWidth: number;
  /** Prefix sums from `columnOffsets`: `offsets[i]` is where column `i` starts. */
  offsets: number[];
  overscanRows: number;
  overscanPx: number;
  /** Snap row bounds to multiples of this so small scrolls don't re-render. Default 1. */
  rowQuantum?: number;
  /** Same, for column bounds. Default 1. */
  colQuantum?: number;
}

export function columnOffsets(widths: number[]): number[] {
  const offsets = new Array<number>(widths.length + 1);
  let total = 0;
  for (let i = 0; i < widths.length; i++) {
    offsets[i] = total;
    total += widths[i];
  }
  offsets[widths.length] = total;
  return offsets;
}

/** Stretches columns to fill `available` the way a table distributes spare width. */
export function fitColumnWidths(widths: number[], available: number): number[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (widths.length === 0 || total <= 0 || total >= available) return widths;
  const factor = available / total;
  return widths.map((w) => w * factor);
}

/** First index in `[0, count]` for which `isAtOrPast(index)` holds (`count` if none). */
function firstIndex(count: number, isAtOrPast: (index: number) => boolean): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (isAtOrPast(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function computeGridRange(input: GridWindowInput): GridRange {
  const { rowCount, rowHeight, offsets } = input;
  const colCount = Math.max(0, offsets.length - 1);

  const bodyTop = Math.max(0, input.scrollTop - input.headerHeight);
  const bodyBottom = Math.max(
    0,
    input.scrollTop + input.viewportHeight - input.headerHeight,
  );
  const firstRow = Math.floor(bodyTop / rowHeight);
  const lastRow = Math.ceil(bodyBottom / rowHeight);
  const rowStart = Math.min(rowCount, Math.max(0, firstRow - input.overscanRows));
  const rowEnd = Math.min(rowCount, Math.max(0, lastRow + input.overscanRows));

  const left = input.scrollLeft - input.leadingWidth - input.overscanPx;
  const right =
    input.scrollLeft + input.viewportWidth - input.leadingWidth + input.overscanPx;
  // First column that ends past the left edge, and first column starting at/after the right edge.
  const colStart = Math.min(
    colCount,
    firstIndex(colCount, (i) => offsets[i + 1] > left),
  );
  const colEnd = Math.max(
    colStart,
    firstIndex(colCount, (i) => offsets[i] >= right),
  );

  const rq = Math.max(1, input.rowQuantum ?? 1);
  const cq = Math.max(1, input.colQuantum ?? 1);
  return {
    rowStart: Math.floor(rowStart / rq) * rq,
    rowEnd: Math.min(rowCount, Math.ceil(Math.max(rowStart, rowEnd) / rq) * rq),
    colStart: Math.floor(colStart / cq) * cq,
    colEnd: Math.min(colCount, Math.ceil(colEnd / cq) * cq),
  };
}

export function sameGridRange(a: GridRange, b: GridRange): boolean {
  return (
    a.rowStart === b.rowStart &&
    a.rowEnd === b.rowEnd &&
    a.colStart === b.colStart &&
    a.colEnd === b.colEnd
  );
}
