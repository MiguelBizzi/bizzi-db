import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  buildLookupSql,
  columnsForForeignRow,
  floaterPosition,
  foreignKeyPreviewSql,
  lookupColumns,
  resolveReferencedTable,
  rowSecondaryLabel,
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
    expect(foreignKeyPreviewSql(table('users'), 'id', "O'Brien")).toBe(
      `SELECT * FROM "public"."users" WHERE "id" = 'O''Brien' LIMIT 1;`
    );
  });

  test('leaves numeric literals unquoted', () => {
    expect(
      foreignKeyPreviewSql(table('orders', { schema: 'sales' }), 'user_id', 42)
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

describe('lookupColumns', () => {
  test('picks the target key plus name/email-style labels', () => {
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true, type: 'uuid' }),
        column('email', { type: 'varchar' }),
        column('full_name'),
        column('bio', { type: 'text' }),
        column('metadata', { type: 'jsonb' }),
      ],
    });
    expect(lookupColumns(users, 'id')).toEqual(['id', 'full_name', 'email']);
  });
});

describe('buildLookupSql', () => {
  const users = table('users', {
    columns: [
      column('id', { isPrimary: true, type: 'uuid' }),
      column('email'),
      column('name'),
    ],
  });

  test('lists the first page when the query is empty', () => {
    expect(buildLookupSql(users, 'id', '', 0)).toBe(
      'SELECT "id", "name", "email" FROM "public"."users" ORDER BY "id" LIMIT 21 OFFSET 0;'
    );
  });

  test('ILIKE-searches label columns and escapes wildcards', () => {
    expect(buildLookupSql(users, 'id', "O'Brien%", 20)).toBe(
      `SELECT "id", "name", "email" FROM "public"."users" WHERE CAST("id" AS text) ILIKE '%O''Brien\\%%' ESCAPE '\\' OR CAST("name" AS text) ILIKE '%O''Brien\\%%' ESCAPE '\\' OR CAST("email" AS text) ILIKE '%O''Brien\\%%' ESCAPE '\\' ORDER BY "id" LIMIT 21 OFFSET 20;`
    );
  });
});

describe('rowSecondaryLabel', () => {
  test('joins non-key columns with names', () => {
    expect(
      rowSecondaryLabel({ id: 3, name: 'Ada', email: 'ada@ex.com' }, 'id')
    ).toBe('name: Ada · email: ada@ex.com');
  });
});
