import { describe, expect, test } from 'bun:test';
import type { CollectionSchema, WorkspaceTab } from '../../types';
import { closableCollectionTabIds, openCollectionTab } from './documentTabs';

const coll = (name: string, database = 'shop'): CollectionSchema => ({
  id: `${database}.${name}`,
  database,
  name,
  kind: 'collection',
  capped: false,
  indexes: [],
});

const tab = (patch: Partial<WorkspaceTab>) => ({ id: 't', title: '', type: 'sql_editor', ...patch }) as WorkspaceTab;

describe('openCollectionTab', () => {
  test('adds a collection tab and activates it', () => {
    const result = openCollectionTab([], coll('users'), 'conn1');
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0]).toMatchObject({
      type: 'collection_documents',
      title: 'users',
      tableId: 'shop.users',
      tableName: 'users',
      databaseId: 'conn1',
    });
    expect(result.activeId).toBe(result.tabs[0].id);
  });

  test('reuses an open tab for the same collection', () => {
    const first = openCollectionTab([], coll('users'), 'conn1');
    const second = openCollectionTab(first.tabs, coll('users'), 'conn1');
    expect(second.tabs).toHaveLength(1);
    expect(second.activeId).toBe(first.activeId);
  });

  test('opens separate tabs for different collections and connections', () => {
    const first = openCollectionTab([], coll('users'), 'conn1');
    const second = openCollectionTab(first.tabs, coll('orders'), 'conn1');
    const third = openCollectionTab(second.tabs, coll('users'), 'conn2');
    expect(third.tabs).toHaveLength(3);
  });
});

describe('closableCollectionTabIds', () => {
  test('selects collection tabs for the dropped collection only', () => {
    const tabs = [
      tab({ id: 'a', type: 'collection_documents', tableId: 'shop.users', databaseId: 'conn1' }),
      tab({ id: 'b', type: 'collection_documents', tableId: 'shop.orders', databaseId: 'conn1' }),
      tab({ id: 'c', type: 'table_data', tableId: 'shop.users', databaseId: 'conn1' }),
    ];
    expect(closableCollectionTabIds(tabs, 'shop.users', 'conn1')).toEqual(['a']);
  });

  test('leaves same-named collections of other connections open', () => {
    const tabs = [
      tab({ id: 'a', type: 'collection_documents', tableId: 'shop.users', databaseId: 'conn1' }),
      tab({ id: 'b', type: 'collection_documents', tableId: 'shop.users', databaseId: 'conn2' }),
    ];
    expect(closableCollectionTabIds(tabs, 'shop.users', 'conn1')).toEqual(['a']);
  });
});
