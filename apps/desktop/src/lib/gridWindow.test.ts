import { describe, expect, test } from "bun:test";
import {
  GRID_HEADER_HEIGHT,
  GRID_ROW_HEIGHT,
  columnOffsets,
  computeGridRange,
  fitColumnWidths,
  sameGridRange,
} from "./gridWindow";

const base = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportWidth: 1000,
  viewportHeight: 400,
  rowCount: 1000,
  rowHeight: GRID_ROW_HEIGHT,
  headerHeight: GRID_HEADER_HEIGHT,
  leadingWidth: 0,
  offsets: columnOffsets(Array.from({ length: 60 }, () => 200)),
  overscanRows: 5,
  overscanPx: 300,
};

describe("columnOffsets", () => {
  test("builds a prefix sum with a trailing total", () => {
    expect(columnOffsets([10, 20, 30])).toEqual([0, 10, 30, 60]);
    expect(columnOffsets([])).toEqual([0]);
  });
});

describe("computeGridRange", () => {
  test("renders only the viewport plus overscan at the top-left", () => {
    const range = computeGridRange(base);
    expect(range.rowStart).toBe(0);
    // (400 - 37) / 36 rounded up = 11 visible rows, plus 5 overscan
    expect(range.rowEnd).toBe(16);
    expect(range.colStart).toBe(0);
    // 1000px viewport + 300px overscan over 200px columns
    expect(range.colEnd).toBe(7);
  });

  test("moves the window with the scroll position", () => {
    const range = computeGridRange({
      ...base,
      scrollTop: 10_000,
      scrollLeft: 5_000,
    });
    // floor((10000 - 37) / 36) - 5 and ceil((10000 + 400 - 37) / 36) + 5
    expect(range.rowStart).toBe(271);
    expect(range.rowEnd).toBe(293);
    expect(range.colStart).toBe(Math.floor((5_000 - 300) / 200));
    expect(range.colEnd).toBeLessThanOrEqual(33);
    expect(range.colEnd).toBeGreaterThan(range.colStart);
  });

  test("never exceeds the data, even when scrolled past the end", () => {
    const range = computeGridRange({
      ...base,
      scrollTop: 10_000_000,
      scrollLeft: 10_000_000,
    });
    expect(range.rowEnd).toBe(1000);
    expect(range.rowStart).toBeLessThanOrEqual(1000);
    expect(range.colEnd).toBe(60);
    expect(range.colStart).toBeLessThanOrEqual(60);
  });

  test("accounts for a leading fixed column", () => {
    const withLead = computeGridRange({
      ...base,
      scrollLeft: 1_000,
      leadingWidth: 41,
    });
    const without = computeGridRange({ ...base, scrollLeft: 1_000 });
    expect(withLead.colStart).toBeLessThanOrEqual(without.colStart);
  });

  test("handles empty data and zero-size viewports", () => {
    expect(
      computeGridRange({ ...base, rowCount: 0, offsets: columnOffsets([]) }),
    ).toEqual({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 });
    const hidden = computeGridRange({
      ...base,
      viewportWidth: 0,
      viewportHeight: 0,
    });
    expect(hidden.rowEnd).toBeLessThanOrEqual(base.overscanRows + 1);
    expect(hidden.colStart).toBe(0);
  });

  test("window size does not grow with row or column count", () => {
    const small = computeGridRange(base);
    const huge = computeGridRange({
      ...base,
      rowCount: 5_000_000,
      offsets: columnOffsets(Array.from({ length: 5000 }, () => 200)),
    });
    expect(huge.rowEnd - huge.rowStart).toBe(small.rowEnd - small.rowStart);
    expect(huge.colEnd - huge.colStart).toBe(small.colEnd - small.colStart);
  });
});

describe("computeGridRange quantization", () => {
  const quantized = { ...base, rowQuantum: 8, colQuantum: 4 };

  test("snaps bounds to the quantum without shrinking the overscan", () => {
    const exact = computeGridRange({ ...base, scrollTop: 5_000, scrollLeft: 3_000 });
    const snapped = computeGridRange({ ...quantized, scrollTop: 5_000, scrollLeft: 3_000 });
    expect(snapped.rowStart % 8).toBe(0);
    expect(snapped.colStart % 4).toBe(0);
    expect(snapped.rowStart).toBeLessThanOrEqual(exact.rowStart);
    expect(snapped.rowEnd).toBeGreaterThanOrEqual(exact.rowEnd);
    expect(snapped.colStart).toBeLessThanOrEqual(exact.colStart);
    expect(snapped.colEnd).toBeGreaterThanOrEqual(exact.colEnd);
  });

  test("small scrolls usually leave the window unchanged", () => {
    let changes = 0;
    let prev = computeGridRange(quantized);
    for (let top = 1; top <= 3_600; top += 36) {
      const next = computeGridRange({ ...quantized, scrollTop: top });
      if (!sameGridRange(prev, next)) changes++;
      prev = next;
    }
    // 100 one-row steps: the start and end bounds each cross a boundary about
    // every 8 rows (~25 changes), versus one change per row without snapping
    expect(changes).toBeLessThanOrEqual(28);
  });

  test("still clamps to the data", () => {
    const end = computeGridRange({ ...quantized, scrollTop: 10_000_000, scrollLeft: 10_000_000 });
    expect(end.rowEnd).toBe(1000);
    expect(end.colEnd).toBe(60);
  });
});

describe("sameGridRange", () => {
  test("compares every bound", () => {
    const a = { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 };
    expect(sameGridRange(a, { ...a })).toBe(true);
    expect(sameGridRange(a, { ...a, rowEnd: 11 })).toBe(false);
    expect(sameGridRange(a, { ...a, colStart: 1 })).toBe(false);
  });
});

describe("fitColumnWidths", () => {
  test("stretches proportionally to fill a wider viewport", () => {
    expect(fitColumnWidths([100, 300], 800)).toEqual([200, 600]);
  });

  test("keeps natural widths when content is wider than the viewport", () => {
    expect(fitColumnWidths([500, 600], 800)).toEqual([500, 600]);
  });

  test("copes with no columns", () => {
    expect(fitColumnWidths([], 800)).toEqual([]);
  });
});
