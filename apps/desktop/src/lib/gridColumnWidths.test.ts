import { describe, expect, test } from "bun:test";
import {
  CELL_PADDING_X,
  cellTextUnits,
  estimateColumnWidths,
} from "./gridColumnWidths";
import { SET_COLUMN_DEFAULT } from "./pendingChanges";

const CHAR = 7;
const column = (name: string, extra: Record<string, unknown> = {}) =>
  ({ name, type: "text", ...extra }) as any;

describe("cellTextUnits", () => {
  test("counts ASCII as one unit per character", () => {
    expect(cellTextUnits("hello")).toBe(5);
    expect(cellTextUnits("")).toBe(0);
  });

  test("counts wide (CJK/emoji) characters as two units", () => {
    expect(cellTextUnits("日本")).toBe(4);
    expect(cellTextUnits("a😀")).toBe(3);
  });
});

describe("estimateColumnWidths", () => {
  const opts = { charWidth: CHAR, pending: [] as any[] };

  test("a column is as wide as its widest cell", () => {
    const widths = estimateColumnWidths(
      [column("a")],
      [{ a: "x" }, { a: "x".repeat(40) }, { a: "xx" }],
      opts,
    );
    expect(widths[0]).toBeGreaterThanOrEqual(40 * CHAR + CELL_PADDING_X);
    expect(widths[0]).toBeLessThan(40 * CHAR + CELL_PADDING_X + 80);
  });

  test("the header can be wider than every cell", () => {
    const [w] = estimateColumnWidths(
      [column("a_very_long_column_name")],
      [{ a_very_long_column_name: 1 }],
      opts,
    );
    expect(w).toBeGreaterThanOrEqual(23 * CHAR + CELL_PADDING_X);
  });

  test("widths grow monotonically with content and never shrink below padding", () => {
    const [narrow] = estimateColumnWidths([column("a")], [{ a: "1" }], opts);
    const [wide] = estimateColumnWidths([column("a")], [{ a: "1".repeat(30) }], opts);
    expect(wide).toBeGreaterThan(narrow);
    expect(narrow).toBeGreaterThan(CELL_PADDING_X);
  });

  test("null, boolean, default and json cells get a sane width", () => {
    const cols = [column("n"), column("b"), column("d"), column("j")];
    const widths = estimateColumnWidths(
      cols,
      [{ n: null, b: true, d: SET_COLUMN_DEFAULT, j: { a: 1 } }],
      opts,
    );
    for (const w of widths) expect(w).toBeGreaterThan(CELL_PADDING_X);
    // the json preview button is wider than a boolean badge
    expect(widths[3]).toBeGreaterThan(widths[1]);
  });

  test("foreign-key columns reserve room for the lookup button", () => {
    const fk = { targetTable: "t", targetColumn: "id" };
    const rows = [{ a: "abcde" }];
    const [plain] = estimateColumnWidths([column("a")], rows, opts);
    const [withFk] = estimateColumnWidths(
      [column("a", { foreignKey: fk })],
      rows,
      opts,
    );
    expect(withFk).toBeGreaterThan(plain);
  });

  test("pending updates widen the column to fit the new value", () => {
    const [before] = estimateColumnWidths([column("a")], [{ a: "x", id: 1 }], opts);
    const [after] = estimateColumnWidths([column("a")], [{ a: "x", id: 1 }], {
      ...opts,
      pending: [{ columnName: "a", newValue: "y".repeat(50) }],
    });
    expect(after).toBeGreaterThan(before);
  });

  test("scales to many columns and rows quickly", () => {
    const cols = Array.from({ length: 100 }, (_, i) => column(`c${i}`));
    const rows = Array.from({ length: 1000 }, (_, r) =>
      Object.fromEntries(cols.map((c, i) => [c.name, `v${r}-${i}`])),
    );
    const t0 = performance.now();
    const widths = estimateColumnWidths(cols, rows, opts);
    expect(widths).toHaveLength(100);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
