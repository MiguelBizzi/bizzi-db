import { describe, expect, test } from 'bun:test';
import {
  clampResultsFraction,
  DEFAULT_RESULTS_FRACTION,
  readResultsFraction,
  writeResultsFraction,
} from './sqlEditorLayout';

describe('clampResultsFraction', () => {
  test('keeps values inside 0.2–0.8', () => {
    expect(clampResultsFraction(0.5)).toBe(0.5);
    expect(clampResultsFraction(0.2)).toBe(0.2);
    expect(clampResultsFraction(0.8)).toBe(0.8);
    expect(clampResultsFraction(0.01)).toBe(0.2);
    expect(clampResultsFraction(0.99)).toBe(0.8);
  });

  test('falls back for non-finite input', () => {
    expect(clampResultsFraction(Number.NaN)).toBe(DEFAULT_RESULTS_FRACTION);
    expect(clampResultsFraction(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RESULTS_FRACTION);
  });
});

describe('results fraction storage', () => {
  test('reads a stored fraction and ignores junk', () => {
    const storage = new Map<string, string>([['sql-editor-results-fraction', '0.7']]);
    expect(
      readResultsFraction({ getItem: (key) => storage.get(key) ?? null })
    ).toBe(0.7);

    expect(
      readResultsFraction({ getItem: () => 'not-a-number' })
    ).toBe(DEFAULT_RESULTS_FRACTION);

    expect(readResultsFraction({ getItem: () => null })).toBe(DEFAULT_RESULTS_FRACTION);
  });

  test('writes a clamped fraction', () => {
    const storage = new Map<string, string>();
    writeResultsFraction(
      { setItem: (key, value) => storage.set(key, value) },
      0.95
    );
    expect(storage.get('sql-editor-results-fraction')).toBe('0.8');
  });
});
