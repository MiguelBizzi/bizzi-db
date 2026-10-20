import { describe, expect, test } from 'bun:test';
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  readSidebarCollapsed,
  readSidebarWidth,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from './sidebarLayout';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
};

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('clampSidebarWidth', () => {
  test('keeps values inside the bounds', () => {
    expect(clampSidebarWidth(300)).toBe(300);
    expect(clampSidebarWidth(MIN_SIDEBAR_WIDTH)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(MAX_SIDEBAR_WIDTH)).toBe(MAX_SIDEBAR_WIDTH);
  });

  test('pins out-of-range widths to the nearest bound instead of collapsing', () => {
    expect(clampSidebarWidth(0)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(-50)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(5000)).toBe(MAX_SIDEBAR_WIDTH);
  });

  test('rounds to whole pixels', () => {
    expect(clampSidebarWidth(300.6)).toBe(301);
  });

  test('falls back to the default for non-finite input', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});

describe('sidebar width storage', () => {
  test('reads a stored width', () => {
    expect(readSidebarWidth(memoryStorage({ [SIDEBAR_WIDTH_KEY]: '340' }))).toBe(340);
  });

  test('clamps a stored width that is out of range', () => {
    expect(readSidebarWidth(memoryStorage({ [SIDEBAR_WIDTH_KEY]: '9999' }))).toBe(
      MAX_SIDEBAR_WIDTH
    );
  });

  test('uses the default when nothing, junk or an empty string is stored', () => {
    expect(readSidebarWidth(memoryStorage())).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(readSidebarWidth(memoryStorage({ [SIDEBAR_WIDTH_KEY]: 'wide' }))).toBe(
      DEFAULT_SIDEBAR_WIDTH
    );
    expect(readSidebarWidth(memoryStorage({ [SIDEBAR_WIDTH_KEY]: '' }))).toBe(
      DEFAULT_SIDEBAR_WIDTH
    );
  });

  test('uses the default when storage is missing or throws', () => {
    expect(readSidebarWidth(undefined)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(readSidebarWidth(throwingStorage)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  test('writes a clamped width and ignores a throwing storage', () => {
    const storage = memoryStorage();
    writeSidebarWidth(storage, 9999);
    expect(storage.map.get(SIDEBAR_WIDTH_KEY)).toBe(String(MAX_SIDEBAR_WIDTH));
    expect(() => writeSidebarWidth(throwingStorage, 300)).not.toThrow();
    expect(() => writeSidebarWidth(undefined, 300)).not.toThrow();
  });
});

describe('sidebar collapsed storage', () => {
  test('defaults to expanded', () => {
    expect(readSidebarCollapsed(memoryStorage())).toBe(false);
    expect(readSidebarCollapsed(undefined)).toBe(false);
    expect(readSidebarCollapsed(throwingStorage)).toBe(false);
  });

  test('round-trips the collapsed flag', () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(storage, true);
    expect(storage.map.get(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(storage, false);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  test('treats unknown stored values as expanded and ignores a throwing storage', () => {
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: 'yes' }))).toBe(false);
    expect(() => writeSidebarCollapsed(throwingStorage, true)).not.toThrow();
  });
});
