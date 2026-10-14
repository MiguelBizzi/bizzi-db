import { describe, expect, test } from 'bun:test';
import {
  buildStorageDistribution,
  OTHER_THRESHOLD_PCT,
  TOP_COUNT,
} from './storageDistribution';

const t = (name: string, sizeMb: number, isView = false) => ({ name, sizeMb, isView });

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => t(`table_${i}`, (i + 1) * 10));

describe('buildStorageDistribution', () => {
  test('returns an empty distribution for no tables', () => {
    const d = buildStorageDistribution([]);
    expect(d.top).toEqual([]);
    expect(d.other).toEqual([]);
    expect(d.unknown).toEqual([]);
    expect(d.totalMb).toBe(0);
  });

  test('sorts descending and computes percentages', () => {
    const d = buildStorageDistribution([t('a', 10), t('b', 30), t('c', 60)]);
    expect(d.top.map((r) => r.name)).toEqual(['c', 'b', 'a']);
    expect(d.top.map((r) => r.pct)).toEqual([60, 30, 10]);
    expect(d.totalMb).toBe(100);
    expect(d.other).toEqual([]);
  });

  test('breaks ties by name for stable ordering', () => {
    const d = buildStorageDistribution([t('b', 5), t('a', 5)]);
    expect(d.top.map((r) => r.name)).toEqual(['a', 'b']);
  });

  test('keeps at most TOP_COUNT rows in the primary view', () => {
    const d = buildStorageDistribution(many(50));
    expect(d.top.length).toBeLessThanOrEqual(TOP_COUNT);
    expect(d.top.length + d.other.length).toBe(50);
    expect(d.top[0].name).toBe('table_49');
  });

  test('moves tables below the percentage threshold into other, even within the top N', () => {
    const d = buildStorageDistribution([t('big', 1000), t('tiny', 1)]);
    expect(1 / 1001 * 100).toBeLessThan(OTHER_THRESHOLD_PCT);
    expect(d.top.map((r) => r.name)).toEqual(['big']);
    expect(d.other.map((r) => r.name)).toEqual(['tiny']);
  });

  test('top and other always account for the full total', () => {
    for (const n of [1, 5, 8, 9, 50, 500]) {
      const d = buildStorageDistribution(many(n));
      const sum = [...d.top, ...d.other].reduce((s, r) => s + r.sizeMb, 0);
      expect(sum).toBeCloseTo(d.totalMb, 6);
      const pct = [...d.top, ...d.other].reduce((s, r) => s + r.pct, 0);
      expect(pct).toBeCloseTo(100, 6);
    }
  });

  test('handles 500 tables without losing any', () => {
    const d = buildStorageDistribution(many(500));
    expect(d.top.length + d.other.length).toBe(500);
    expect(d.other.length).toBeGreaterThan(0);
  });

  test('puts unknown-size tables and views aside without counting them', () => {
    const d = buildStorageDistribution([
      t('real', 40),
      t('neg', -1),
      t('nan', Number.NaN),
      t('view', 0, true),
    ]);
    expect(d.top.map((r) => r.name)).toEqual(['real']);
    expect(d.unknown.map((r) => r.name).sort()).toEqual(['nan', 'neg', 'view']);
    expect(d.totalMb).toBe(40);
  });

  test('zero-size tables stay accounted for and an all-zero total yields 0%', () => {
    const d = buildStorageDistribution([t('a', 0), t('b', 0)]);
    expect(d.totalMb).toBe(0);
    expect([...d.top, ...d.other].length).toBe(2);
    expect([...d.top, ...d.other].every((r) => r.pct === 0)).toBe(true);
  });

  test('reports the combined size and share of other', () => {
    const d = buildStorageDistribution([t('big', 1000), t('x', 1), t('y', 2)]);
    expect(d.otherMb).toBe(3);
    expect(d.otherPct).toBeCloseTo((3 / 1003) * 100, 6);
  });
});
