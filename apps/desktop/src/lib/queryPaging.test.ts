import { describe, expect, test } from 'bun:test';
import type { QueryExecutionResult } from '../types';
import {
  hasUnloadedRows,
  lastPageOffset,
  mergePageResult,
  resultTotalRows,
} from './queryPaging';

const result = (extras: Partial<QueryExecutionResult> = {}): QueryExecutionResult => ({
  id: 'r1',
  query: 'select 1',
  timestamp: '',
  executionTimeMs: 1,
  ...extras,
});

describe('lastPageOffset', () => {
  test('points at the first row of the last page', () => {
    expect(lastPageOffset(250, 100)).toBe(200);
    expect(lastPageOffset(200, 100)).toBe(100);
    expect(lastPageOffset(1, 100)).toBe(0);
  });

  test('is zero when there is nothing to page', () => {
    expect(lastPageOffset(0, 100)).toBe(0);
    expect(lastPageOffset(50, 0)).toBe(0);
  });
});

describe('resultTotalRows', () => {
  test('prefers the counted total', () => {
    expect(resultTotalRows(result({ totalRows: 900, rows: [{}], pageOffset: 0 }))).toBe(900);
  });

  test('falls back to what has been loaded', () => {
    expect(resultTotalRows(result({ rows: [{}, {}], pageOffset: 100 }))).toBe(102);
    expect(resultTotalRows(result({ rows: [{}, {}] }))).toBe(2);
    expect(resultTotalRows(result())).toBe(0);
  });
});

describe('mergePageResult', () => {
  const paged = (extras: Partial<QueryExecutionResult> = {}) =>
    result({ pageSize: 10, pageOffset: 20, rows: [{}], ...extras });

  test('keeps the known total when the new page was not counted', () => {
    const merged = mergePageResult({ totalRows: 500 }, paged());
    expect(merged.totalRows).toBe(500);
    expect(merged.affectedRows).toBe(500);
  });

  test('takes a fresh count over the old one', () => {
    expect(mergePageResult({ totalRows: 500 }, paged({ totalRows: 42 })).totalRows).toBe(42);
  });

  test('leaves errors and unpaged results alone', () => {
    const failed = result({ error: 'boom' });
    expect(mergePageResult({ totalRows: 500 }, failed)).toBe(failed);
    const unpaged = result({ rows: [{}] });
    expect(mergePageResult({ totalRows: 500 }, unpaged)).toBe(unpaged);
  });
});

describe('hasUnloadedRows', () => {
  test('is false for unpaged results and complete pages', () => {
    expect(hasUnloadedRows(result({ rows: [{}] }))).toBe(false);
    expect(hasUnloadedRows(result({ pageSize: 10, totalRows: 1, rows: [{}] }))).toBe(false);
  });

  test('is true when more rows exist than are loaded, or the count is unknown', () => {
    expect(hasUnloadedRows(result({ pageSize: 10, totalRows: 11, rows: [{}] }))).toBe(true);
    expect(hasUnloadedRows(result({ pageSize: 10, rows: [{}] }))).toBe(true);
  });
});
