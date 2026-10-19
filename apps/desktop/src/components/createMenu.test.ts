import { describe, expect, test } from 'bun:test';
import { shortcutLabel } from '../lib/commands/shortcutLabel';
import { createMenuItems } from './createMenu';

describe('createMenuItems', () => {
  test('offers table, view and function with their File menu shortcuts', () => {
    const calls: string[] = [];
    const items = createMenuItems({
      onNewTable: () => calls.push('table'),
      onNewView: () => calls.push('view'),
      onNewFunction: () => calls.push('function'),
    });
    expect(items.map((item) => item.id)).toEqual(['new-table', 'new-view', 'new-function']);
    expect(items.map((item) => item.hint)).toEqual([
      shortcutLabel('file.newTable'),
      shortcutLabel('file.newView'),
      shortcutLabel('file.newFunction'),
    ]);
    expect(items.every((item) => item.hint)).toBe(true);
    for (const item of items) item.onSelect?.();
    expect(calls).toEqual(['table', 'view', 'function']);
  });

  test('disables entries without a handler', () => {
    expect(createMenuItems({}).every((item) => item.disabled)).toBe(true);
  });
});
