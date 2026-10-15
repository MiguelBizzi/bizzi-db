import { describe, expect, test } from 'bun:test';
import { hasRunnableSelection, resolveRunTarget } from './runTarget';

const DOC = 'SELECT 1;\n\nSELECT 2;\nSELECT 3';
// Statement ranges as the backend reports them (trimmed, `;` excluded).
const RANGES = [
  { start: 0, end: 8 },
  { start: 11, end: 19 },
  { start: 21, end: 29 },
];
const caret = (pos: number) => ({ from: pos, to: pos });

describe('resolveRunTarget', () => {
  test('runs the selected text when there is a selection', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 11, to: 19 }, ranges: RANGES, mode: 'auto' })
    ).toEqual({ kind: 'selection', sql: 'SELECT 2' });
  });

  test('runs a partial selection exactly as selected', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 7, to: 8 }, ranges: RANGES, mode: 'auto' })
    ).toEqual({ kind: 'selection', sql: '1' });
  });

  test('runs every selected statement when the selection spans several', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 0, to: 19 }, ranges: RANGES, mode: 'auto' })
    ).toEqual({ kind: 'selection', sql: 'SELECT 1;\n\nSELECT 2' });
  });

  test('ignores a selection that is only whitespace', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 9, to: 11 }, ranges: RANGES, mode: 'auto' })
    ).toEqual({ kind: 'statement', sql: 'SELECT 1' });
  });

  test('runs the statement the caret is inside', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(14), ranges: RANGES, mode: 'auto' })
    ).toEqual({ kind: 'statement', sql: 'SELECT 2' });
  });

  test('runs the statement the caret touches at its start or end', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(11), ranges: RANGES, mode: 'auto' }).sql
    ).toBe('SELECT 2');
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(19), ranges: RANGES, mode: 'auto' }).sql
    ).toBe('SELECT 2');
  });

  test('a caret just after the semicolon still belongs to that statement', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(9), ranges: RANGES, mode: 'auto' }).sql
    ).toBe('SELECT 1');
  });

  test('a caret on the blank line between statements runs the previous one', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(10), ranges: RANGES, mode: 'auto' }).sql
    ).toBe('SELECT 1');
  });

  test('a caret after the last statement runs the last one', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(DOC.length), ranges: RANGES, mode: 'auto' }).sql
    ).toBe('SELECT 3');
  });

  test('a caret before the first statement runs the first one', () => {
    const doc = '\n\nSELECT 1;\nSELECT 2';
    const ranges = [
      { start: 2, end: 10 },
      { start: 12, end: 20 },
    ];
    expect(resolveRunTarget({ doc, selection: caret(0), ranges, mode: 'auto' }).sql).toBe(
      'SELECT 1'
    );
  });

  test('run all ignores selection and caret', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 11, to: 19 }, ranges: RANGES, mode: 'all' })
    ).toEqual({ kind: 'all', sql: DOC });
  });

  test('a single statement runs as a statement', () => {
    expect(
      resolveRunTarget({
        doc: '  SELECT 1  ',
        selection: caret(4),
        ranges: [{ start: 2, end: 10 }],
        mode: 'auto',
      })
    ).toEqual({ kind: 'statement', sql: 'SELECT 1' });
  });

  test('has nothing to run on a blank script', () => {
    expect(resolveRunTarget({ doc: '  \n', selection: caret(0), ranges: [], mode: 'auto' })).toBeNull();
    expect(resolveRunTarget({ doc: '  \n', selection: caret(0), ranges: [], mode: 'all' })).toBeNull();
  });

  test('falls back to the whole script when no ranges are known', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: caret(14), ranges: null, mode: 'auto' })
    ).toEqual({ kind: 'all', sql: DOC });
  });

  test('still honours a selection when no ranges are known', () => {
    expect(
      resolveRunTarget({ doc: DOC, selection: { from: 11, to: 19 }, ranges: null, mode: 'auto' })
    ).toEqual({ kind: 'selection', sql: 'SELECT 2' });
  });
});

describe('hasRunnableSelection', () => {
  test('is true for a non-blank selection', () => {
    expect(hasRunnableSelection(DOC, { from: 0, to: 8 })).toBe(true);
  });

  test('is false for a caret or a whitespace-only selection', () => {
    expect(hasRunnableSelection(DOC, caret(3))).toBe(false);
    expect(hasRunnableSelection(DOC, { from: 9, to: 11 })).toBe(false);
  });
});
