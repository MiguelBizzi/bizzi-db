import { describe, expect, test } from 'bun:test';
import { adjacentTabId, nthTabId } from './tabNavigation';

describe('adjacentTabId', () => {
  test('moves forward and wraps to the first tab', () => {
    expect(adjacentTabId(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(adjacentTabId(['a', 'b', 'c'], 'c', 1)).toBe('a');
  });

  test('moves backward and wraps to the last tab', () => {
    expect(adjacentTabId(['a', 'b', 'c'], 'b', -1)).toBe('a');
    expect(adjacentTabId(['a', 'b', 'c'], 'a', -1)).toBe('c');
  });

  test('returns null with fewer than two tabs', () => {
    expect(adjacentTabId(['a'], 'a', 1)).toBeNull();
    expect(adjacentTabId([], 'a', -1)).toBeNull();
  });

  test('returns null when the active tab is unknown', () => {
    expect(adjacentTabId(['a', 'b'], 'zzz', 1)).toBeNull();
  });
});

describe('nthTabId', () => {
  test('selects the 1-based nth tab', () => {
    expect(nthTabId(['a', 'b', 'c'], 1)).toBe('a');
    expect(nthTabId(['a', 'b', 'c'], 2)).toBe('b');
  });

  test('returns null when n is beyond the tab count', () => {
    expect(nthTabId(['a', 'b'], 3)).toBeNull();
  });

  test('n === 9 returns the last tab', () => {
    expect(nthTabId(['a', 'b', 'c'], 9)).toBe('c');
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(nthTabId(many, 9)).toBe('t11');
    expect(nthTabId(many, 8)).toBe('t7');
  });

  test('returns null for out-of-range n or an empty list', () => {
    expect(nthTabId(['a'], 0)).toBeNull();
    expect(nthTabId(['a'], -1)).toBeNull();
    expect(nthTabId(['a'], 10)).toBeNull();
    expect(nthTabId([], 1)).toBeNull();
    expect(nthTabId([], 9)).toBeNull();
  });
});
