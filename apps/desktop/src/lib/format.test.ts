import { describe, expect, test } from 'bun:test';
import { formatSizeMb } from './format';

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
