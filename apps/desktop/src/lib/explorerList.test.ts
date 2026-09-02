import { describe, expect, test } from 'bun:test';
import { explorerListMode } from './explorerList';

describe('explorerListMode', () => {
  test('shows a skeleton while schemas are loading', () => {
    expect(explorerListMode(true, 12)).toBe('skeleton');
    expect(explorerListMode(true, 0)).toBe('skeleton');
  });

  test('shows the table list when loaded with tables', () => {
    expect(explorerListMode(false, 3)).toBe('list');
  });

  test('shows the empty state when loaded with no tables', () => {
    expect(explorerListMode(false, 0)).toBe('empty');
  });
});
