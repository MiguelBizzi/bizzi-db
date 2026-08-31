import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition } from '../types';
import { SET_COLUMN_DEFAULT } from './pendingChanges';
import {
  canSetDefault,
  canSetEmpty,
  canSetNull,
  cellClipboardText,
  filterFromCell,
  numericFilterOps,
  tableFooterRange,
  truncateLabel,
} from './tableCellActions';

function column(name: string, extras: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

const allowed = { isView: false, isPendingDelete: false };

describe('cellClipboardText', () => {
  test('copies empty for null/undefined, JSON for objects, and strings otherwise', () => {
    expect(cellClipboardText(null)).toBe('');
    expect(cellClipboardText(undefined)).toBe('');
    expect(cellClipboardText({ a: 1 })).toBe('{"a":1}');
    expect(cellClipboardText(true)).toBe('true');
    expect(cellClipboardText(42)).toBe('42');
    expect(cellClipboardText('Ada')).toBe('Ada');
    expect(cellClipboardText(SET_COLUMN_DEFAULT)).toBe('');
  });
});

describe('truncateLabel', () => {
  test('keeps short text and truncates long values for menu labels', () => {
    expect(truncateLabel('Ada', 32)).toBe('Ada');
    expect(truncateLabel('x'.repeat(40), 32)).toBe(`${'x'.repeat(31)}…`);
  });
});

describe('filterFromCell', () => {
  test('equals/not-equals/contains use the full cell value', () => {
    expect(filterFromCell('name', 'equals', 'Ada', 'f1')).toEqual({
      id: 'f1',
      column: 'name',
      operator: '=',
      value: 'Ada',
      enabled: true,
    });
    expect(filterFromCell('name', 'notEquals', 'Ada', 'f2').operator).toBe('!=');
    expect(filterFromCell('name', 'contains', 'Ad', 'f3')).toMatchObject({
      operator: 'LIKE',
      value: 'Ad',
    });
  });

  test('maps null cells to IS NULL / IS NOT NULL', () => {
    expect(filterFromCell('role', 'equals', null, 'f1')).toMatchObject({
      operator: 'IS NULL',
      value: '',
    });
    expect(filterFromCell('role', 'notEquals', undefined, 'f2')).toMatchObject({
      operator: 'IS NOT NULL',
      value: '',
    });
  });

  test('greater/less than stringify the numeric value', () => {
    expect(filterFromCell('age', 'gt', 35, 'f1')).toMatchObject({ operator: '>', value: '35' });
    expect(filterFromCell('age', 'lt', 35, 'f2')).toMatchObject({ operator: '<', value: '35' });
  });
});

describe('numericFilterOps', () => {
  test('exposes greater/less than only for integer and decimal columns', () => {
    expect(numericFilterOps(column('age', { type: 'int4' }))).toEqual(['gt', 'lt']);
    expect(numericFilterOps(column('amount', { type: 'numeric' }))).toEqual(['gt', 'lt']);
    expect(numericFilterOps(column('name', { type: 'text' }))).toEqual([]);
    expect(numericFilterOps(column('ok', { type: 'boolean' }))).toEqual([]);
  });
});

describe('set-as eligibility', () => {
  test('blocks empty/null/default on views and pending-delete rows', () => {
    const name = column('name', { isNullable: true, defaultValue: "'x'" });
    expect(canSetEmpty(allowed)).toBe(true);
    expect(canSetEmpty({ isView: true, isPendingDelete: false })).toBe(false);
    expect(canSetEmpty({ isView: false, isPendingDelete: true })).toBe(false);
    expect(canSetNull(name, { isView: true, isPendingDelete: false })).toBe(false);
    expect(canSetDefault(name, { isView: false, isPendingDelete: true })).toBe(false);
  });

  test('null requires a nullable column; default requires a column default', () => {
    const required = column('email', { isNullable: false });
    const optional = column('bio', { isNullable: true });
    const withDefault = column('role', { defaultValue: "'customer'" });
    expect(canSetNull(required, allowed)).toBe(false);
    expect(canSetNull(optional, allowed)).toBe(true);
    expect(canSetDefault(required, allowed)).toBe(false);
    expect(canSetDefault(withDefault, allowed)).toBe(true);
  });
});

describe('tableFooterRange', () => {
  test('keeps the existing range copy and appends a selection count', () => {
    expect(tableFooterRange({ rowCount: 0, rangeStart: 0, rangeEnd: 0, selectedCount: 0 })).toBe(
      'No rows'
    );
    expect(
      tableFooterRange({ rowCount: 5000, rangeStart: 1, rangeEnd: 50, selectedCount: 0 })
    ).toBe('Showing 1–50 of 5,000');
    expect(
      tableFooterRange({ rowCount: 5000, rangeStart: 1, rangeEnd: 50, selectedCount: 3 })
    ).toBe('Showing 1–50 of 5,000 (3 selected)');
    expect(
      tableFooterRange({ rowCount: -1, rangeStart: 1, rangeEnd: -1, selectedCount: 0 })
    ).toBe('');
    expect(
      tableFooterRange({ rowCount: -1, rangeStart: 1, rangeEnd: -1, selectedCount: 2 })
    ).toBe('2 selected');
  });
});
