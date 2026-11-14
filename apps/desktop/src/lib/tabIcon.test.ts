import { describe, expect, test } from 'bun:test';
import type { DatabaseSchema, WorkspaceTab } from '../types';
import { tabObjectKind } from './tabIcon';

const database = {
  tables: [
    { id: 'public.users', isView: false },
    { id: 'public.active', isView: true },
  ],
  routines: [
    { id: 'r1', kind: 'function' },
    { id: 'r2', kind: 'procedure' },
  ],
} as unknown as Pick<DatabaseSchema, 'tables' | 'routines'>;

const tab = (patch: Partial<WorkspaceTab>) => ({ id: 't', title: '', type: 'table_data', ...patch }) as WorkspaceTab;

describe('tabObjectKind', () => {
  test('table data tabs follow the object', () => {
    expect(tabObjectKind(tab({ tableId: 'public.users' }), database)).toBe('table');
    expect(tabObjectKind(tab({ tableId: 'public.active' }), database)).toBe('view');
    expect(tabObjectKind(tab({ type: 'schema_designer', tableId: 'public.users' }), database)).toBeUndefined();
  });

  test('view and routine designers use their own kind', () => {
    expect(tabObjectKind(tab({ type: 'view_designer' }), database)).toBe('view');
    expect(tabObjectKind(tab({ type: 'function_designer', routineId: 'r1' }), database)).toBe('function');
    expect(tabObjectKind(tab({ type: 'function_designer', routineId: 'r2' }), database)).toBe('procedure');
    expect(tabObjectKind(tab({ type: 'function_designer' }), database)).toBe('function');
  });

  test('other tabs and unknown objects have no object kind', () => {
    expect(tabObjectKind(tab({ type: 'sql_editor' }), database)).toBeUndefined();
    expect(tabObjectKind(tab({ tableId: 'gone' }), database)).toBe('table');
    expect(tabObjectKind(tab({ tableId: 'public.users' }), undefined)).toBe('table');
  });
});
