import { describe, expect, test } from 'bun:test';
import { formatSizeMb, knownRowCount, knownSizeMb, tableStatParts } from './format';

describe('formatSizeMb', () => {
  test('always shows two decimal places', () => {
    expect(formatSizeMb(123.4567)).toBe('123.46 MB');
    expect(formatSizeMb(12)).toBe('12.00 MB');
    expect(formatSizeMb(0)).toBe('0.00 MB');
  });

  test('treats non-finite values as zero', () => {
    expect(formatSizeMb(Number.NaN)).toBe('0.00 MB');
    expect(formatSizeMb(Number.POSITIVE_INFINITY)).toBe('0.00 MB');
  });
});

describe('known row/size stats', () => {
  test('hides negative row counts and view sizes of zero', () => {
    expect(knownRowCount(-1)).toBeNull();
    expect(knownRowCount(0)).toBe(0);
    expect(knownRowCount(12)).toBe(12);
    expect(knownSizeMb(0, true)).toBeNull();
    expect(knownSizeMb(0, false)).toBe(0);
    expect(knownSizeMb(1.5, true)).toBe(1.5);
  });

  test('tableStatParts omits unknown view stats', () => {
    expect(tableStatParts({ rowCount: -1, sizeMb: 0, isView: true })).toEqual([]);
    expect(tableStatParts({ rowCount: 12, sizeMb: 1.5, isView: false })).toEqual([
      '12 rows',
      '1.50 MB',
    ]);
  });
});
