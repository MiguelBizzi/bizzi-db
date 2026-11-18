import { describe, expect, test } from 'bun:test';
import type { CollectionKind, CollectionSchema } from '@db/shared';
import { shortcutLabel } from '../lib/commands/shortcutLabel';
import { collectionMenuItems, type CollectionMenuHandlers } from './tableManagementMenu';

const collection = (kind: CollectionKind): CollectionSchema => ({
  id: 'shop.users',
  database: 'shop',
  name: 'users',
  kind,
  capped: false,
  indexes: [],
});

const handlers = (calls: string[]): CollectionMenuHandlers => ({
  onOpen: () => calls.push('open'),
  onInsertDocument: () => calls.push('insert'),
  onNewIndex: () => calls.push('index'),
  onDrop: () => calls.push('drop'),
});

const disabledIds = (kind: CollectionKind, opts?: { disabled?: boolean }) =>
  collectionMenuItems(collection(kind), handlers([]), opts)
    .filter((item) => !item.separator && item.disabled)
    .map((item) => item.id);

describe('collectionMenuItems', () => {
  test('a collection offers every entry with its shortcut', () => {
    const calls: string[] = [];
    const items = collectionMenuItems(collection('collection'), handlers(calls));
    expect(items.map((item) => item.id)).toEqual(['open', 'insertDocument', 'newIndex', 'sep-drop', 'drop']);
    expect(disabledIds('collection')).toEqual([]);
    expect(items.find((item) => item.id === 'insertDocument')?.hint).toBe(shortcutLabel('edit.insertRow'));
    expect(items.find((item) => item.id === 'newIndex')?.hint).toBe(shortcutLabel('file.newIndex'));
    for (const item of items) item.onSelect?.();
    expect(calls).toEqual(['open', 'insert', 'index', 'drop']);
  });

  test('a view takes no documents and no indexes', () => {
    expect(disabledIds('view')).toEqual(['insertDocument', 'newIndex']);
  });

  test('a time-series collection takes no documents here but does take secondary indexes', () => {
    expect(disabledIds('timeseries')).toEqual(['insertDocument']);
  });

  test('a disabled menu (connection busy) leaves only Open', () => {
    expect(disabledIds('collection', { disabled: true })).toEqual(['insertDocument', 'newIndex', 'drop']);
  });
});
