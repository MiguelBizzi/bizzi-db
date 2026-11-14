import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  columnsForForeignRow,
  floaterPosition,
  foreignKeyGoToFilter,
  foreignKeyPreviewSql,
  foreignRowClipboardText,
  resolveReferencedTable,
  rowKeyValue,
} from './foreignKeyLookup';

function column(
  name: string,
  extras: Partial<ColumnDefinition> = {}
): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

function table(name: string, extras: Partial<TableSchema> = {}): TableSchema {
  return {
    id: extras.id ?? `public.${name}`,
    name,
    schema: extras.schema ?? 'public',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: extras.columns ?? [],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

describe('resolveReferencedTable', () => {
  test('matches a unique table name', () => {
    const users = table('users');
    const orders = table('orders');
    expect(
      resolveReferencedTable([users, orders], orders, {
        targetTable: 'users',
        targetColumn: 'id',
      })?.id
    ).toBe('public.users');
  });

  test('prefers targetSchema, then the source schema', () => {
    const orders = table('orders', { schema: 'billing' });
    const billingUsers = table('users', { id: 'billing.users', schema: 'billing' });
    const publicUsers = table('users');
    expect(
      resolveReferencedTable([billingUsers, publicUsers], orders, {
        targetTable: 'users',
        targetColumn: 'id',
        targetSchema: 'public',
      })?.id
    ).toBe('public.users');
    expect(
      resolveReferencedTable([billingUsers, publicUsers], orders, {
        targetTable: 'users',
        targetColumn: 'id',
      })?.id
    ).toBe('billing.users');
  });

  test('returns undefined when the target table is missing', () => {
    expect(
      resolveReferencedTable([table('orders')], table('orders'), {
        targetTable: 'users',
        targetColumn: 'id',
      })
    ).toBeUndefined();
  });
});

describe('foreignKeyPreviewSql', () => {
  test('quotes schema, table, column, and string values', () => {
    expect(foreignKeyPreviewSql(table('users'), 'id', "O'Brien", 'PostgreSQL')).toBe(
      `SELECT * FROM "public"."users" WHERE "id" = 'O''Brien' LIMIT 1;`
    );
  });

  test('leaves numeric literals unquoted', () => {
    expect(
      foreignKeyPreviewSql(table('orders', { schema: 'sales' }), 'user_id', 42, 'PostgreSQL')
    ).toBe(`SELECT * FROM "sales"."orders" WHERE "user_id" = 42 LIMIT 1;`);
  });
});

describe('columnsForForeignRow', () => {
  test('puts primary key then target column before the rest', () => {
    const users = table('users', {
      columns: [
        column('name'),
        column('email', { isUnique: true }),
        column('id', { isPrimary: true, type: 'int4' }),
        column('created_at', { type: 'timestamptz' }),
      ],
    });
    expect(columnsForForeignRow(users, 'email', null)).toEqual([
      'id',
      'email',
      'name',
      'created_at',
    ]);
  });

  test('appends row keys missing from the schema', () => {
    const users = table('users', {
      columns: [column('id', { isPrimary: true })],
    });
    expect(columnsForForeignRow(users, 'id', { id: 1, extra: 'x' })).toEqual([
      'id',
      'extra',
    ]);
  });
});

describe('floaterPosition', () => {
  const size = { width: 320, height: 240 };

  test('opens below-left of the anchor when there is room', () => {
    expect(
      floaterPosition(
        { top: 40, left: 80, bottom: 56, right: 96 },
        size,
        { width: 1200, height: 800 }
      )
    ).toEqual({ top: 64, left: 80 });
  });

  test('flips above and left when near the viewport edge', () => {
    expect(
      floaterPosition(
        { top: 700, left: 1000, bottom: 720, right: 1020 },
        size,
        { width: 1100, height: 800 }
      )
    ).toEqual({ top: 452, left: 772 });
  });
});

describe('rowKeyValue', () => {
  test('stringifies the target column and treats null as empty', () => {
    expect(rowKeyValue({ id: 3, name: 'Ada' }, 'id')).toBe('3');
    expect(rowKeyValue({ id: null }, 'id')).toBe('');
  });
});

describe('foreignRowClipboardText', () => {
  test('copies every column as one JSON object in the given order', () => {
    const text = foreignRowClipboardText(['id', 'name', 'meta'], {
      meta: { a: 1 },
      name: 'Ada',
      id: 3,
    });
    expect(JSON.parse(text)).toEqual({ id: 3, name: 'Ada', meta: { a: 1 } });
    expect(Object.keys(JSON.parse(text))).toEqual(['id', 'name', 'meta']);
  });

  test('writes NULL and missing columns as null', () => {
    const text = foreignRowClipboardText(['id', 'note', 'gone'], { id: 1, note: null });
    expect(JSON.parse(text)).toEqual({ id: 1, note: null, gone: null });
  });
});

describe('foreignKeyGoToFilter', () => {
  test('filters the target column for equality with the stringified value', () => {
    expect(foreignKeyGoToFilter('id', 42, 'f_1')).toEqual({
      id: 'f_1',
      column: 'id',
      operator: '=',
      value: '42',
      enabled: true,
    });
  });

  test('keeps text values as they are', () => {
    expect(foreignKeyGoToFilter('code', "O'Brien", 'f_2').value).toBe("O'Brien");
  });
});
