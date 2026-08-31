import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../types';
import {
  changeKey,
  countPendingChanges,
  emptyPending,
  flattenPending,
  formatCellValue,
  groupUpdateRows,
  hasPending,
  primaryKeyColumn,
  removeChange,
  sqlForAll,
  sqlForBundle,
  sqlForChange,
  sqlForDelete,
  sqlForInsert,
  sqlForUpdateRow,
  type TablePendingBundle,
} from './pendingChanges';

function table(name: string, extras: Partial<TableSchema> = {}): TableSchema {
  return {
    id: extras.id ?? `public.${name}`,
    name,
    schema: extras.schema ?? 'public',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: extras.columns ?? [{ name: 'id', type: 'int4', isPrimary: true }],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

function bundle(extras: Partial<TablePendingBundle> = {}): TablePendingBundle {
  const users = table('users');
  return {
    tableId: users.id,
    table: users,
    tableName: users.name,
    schema: users.schema,
    inserts: [],
    updateRows: [],
    deletes: [],
    ...extras,
  };
}

describe('emptyPending / hasPending', () => {
  test('starts empty and reports pending when any collection has items', () => {
    const empty = emptyPending();
    expect(hasPending(empty)).toBe(false);
    expect(hasPending({ ...empty, inserts: [{ tempId: 't1', data: {} }] })).toBe(true);
  });
});

describe('changeKey', () => {
  test('namespaces insert vs update vs delete', () => {
    expect(changeKey({ kind: 'insert', tableId: 'public.users', tempId: 'tmp_1' })).toBe(
      'insert:public.users:tmp_1'
    );
    expect(changeKey({ kind: 'update', tableId: 'public.users', rowId: '9' })).toBe(
      'update:public.users:9'
    );
    expect(changeKey({ kind: 'delete', tableId: 'public.users', rowId: '9' })).toBe(
      'delete:public.users:9'
    );
  });
});

describe('primaryKeyColumn', () => {
  test('uses the primary column and falls back to id', () => {
    expect(
      primaryKeyColumn(table('users', { columns: [{ name: 'uuid', type: 'uuid', isPrimary: true }] }))
    ).toBe('uuid');
    expect(primaryKeyColumn(undefined)).toBe('id');
  });
});

describe('groupUpdateRows', () => {
  test('groups cells that share a primary key', () => {
    const grouped = groupUpdateRows([
      { rowId: 1, primaryKeyValue: 1, columnName: 'name', oldValue: 'A', newValue: "O'Brien" },
      { rowId: 1, primaryKeyValue: 1, columnName: 'email', oldValue: 'a', newValue: 'b' },
      { rowId: 2, primaryKeyValue: 2, columnName: 'name', oldValue: 'C', newValue: 'D' },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].cells).toHaveLength(2);
    expect(grouped[1].rowId).toBe('2');
  });
});

describe('flattenPending / countPendingChanges', () => {
  test('skips empty tables and counts grouped updates as one change', () => {
    const users = table('users');
    const bundles = flattenPending(
      {
        [users.id]: {
          updates: [
            { rowId: 1, primaryKeyValue: 1, columnName: 'name', oldValue: 'A', newValue: 'B' },
            { rowId: 1, primaryKeyValue: 1, columnName: 'bio', oldValue: '', newValue: 'x' },
          ],
          inserts: [{ tempId: 't1', data: { name: 'Ada' } }],
          deletes: [],
        },
        'public.empty': emptyPending(),
      },
      [users]
    );
    expect(bundles).toHaveLength(1);
    expect(bundles[0].updateRows).toHaveLength(1);
    expect(
      countPendingChanges({
        [users.id]: {
          updates: [
            { rowId: 1, primaryKeyValue: 1, columnName: 'name', oldValue: 'A', newValue: 'B' },
            { rowId: 1, primaryKeyValue: 1, columnName: 'bio', oldValue: '', newValue: 'x' },
          ],
          inserts: [{ tempId: 't1', data: { name: 'Ada' } }],
          deletes: [{ rowId: 2, primaryKeyValue: 2, rowData: {} }],
        },
      })
    ).toBe(3);
  });

  test('falls back to tableId and public schema when the table is missing', () => {
    const [orphan] = flattenPending(
      { mystery: { updates: [], inserts: [{ tempId: 't', data: { a: 1 } }], deletes: [] } },
      []
    );
    expect(orphan.tableName).toBe('mystery');
    expect(orphan.schema).toBe('public');
  });
});

describe('sqlForInsert', () => {
  test('emits DEFAULT VALUES when every field is null', () => {
    expect(
      sqlForInsert(bundle(), { tempId: 't1', data: { id: null, name: undefined } })
    ).toBe('INSERT INTO "public"."users" DEFAULT VALUES;');
  });

  test('quotes identifiers and escapes string literals', () => {
    const odd = bundle({
      tableName: 'we"ird',
      schema: 'shop',
    });
    expect(
      sqlForInsert(odd, { tempId: 't1', data: { name: "O'Brien", active: true, n: 3 } })
    ).toBe(`INSERT INTO "shop"."we""ird" ("name", "active", "n") VALUES ('O''Brien', TRUE, 3);`);
  });
});

describe('sqlForUpdateRow / sqlForDelete', () => {
  test('updates and deletes by quoted primary key', () => {
    const users = bundle();
    expect(
      sqlForUpdateRow(users, {
        rowId: '1',
        primaryKeyValue: 1,
        cells: [{ rowId: 1, primaryKeyValue: 1, columnName: 'name', oldValue: 'A', newValue: "O'Brien" }],
      })
    ).toBe(`UPDATE "public"."users" SET "name" = 'O''Brien' WHERE "id" = 1;`);
    expect(
      sqlForDelete(users, { rowId: 1, primaryKeyValue: 1, rowData: { id: 1 } })
    ).toBe('DELETE FROM "public"."users" WHERE "id" = 1;');
  });
});

describe('sqlForChange / sqlForAll', () => {
  test('looks up a change and wraps the batch in a transaction', () => {
    const users = bundle({
      inserts: [{ tempId: 't1', data: { name: 'Ada' } }],
      updateRows: [
        {
          rowId: '2',
          primaryKeyValue: 2,
          cells: [{ rowId: 2, primaryKeyValue: 2, columnName: 'name', oldValue: 'B', newValue: 'C' }],
        },
      ],
      deletes: [{ rowId: 3, primaryKeyValue: 3, rowData: {} }],
    });
    expect(sqlForChange(users, { kind: 'insert', tableId: users.tableId, tempId: 'missing' })).toBeNull();
    expect(sqlForChange(users, { kind: 'insert', tableId: users.tableId, tempId: 't1' })).toContain(
      'INSERT INTO'
    );
    expect(sqlForBundle(users).split('\n')).toHaveLength(3);
    expect(sqlForAll([users])).toBe(
      [
        'BEGIN;',
        `INSERT INTO "public"."users" ("name") VALUES ('Ada');`,
        `UPDATE "public"."users" SET "name" = 'C' WHERE "id" = 2;`,
        `DELETE FROM "public"."users" WHERE "id" = 3;`,
        'COMMIT;',
      ].join('\n')
    );
    expect(sqlForAll([])).toBe('');
  });
});

describe('removeChange', () => {
  test('drops the matching insert, update cells, or delete', () => {
    const pending = {
      inserts: [{ tempId: 't1', data: { a: 1 } }, { tempId: 't2', data: { a: 2 } }],
      updates: [
        { rowId: 1, primaryKeyValue: 1, columnName: 'n', oldValue: 'a', newValue: 'b' },
        { rowId: 2, primaryKeyValue: 2, columnName: 'n', oldValue: 'c', newValue: 'd' },
      ],
      deletes: [{ rowId: 9, primaryKeyValue: 9, rowData: {} }],
    };
    expect(
      removeChange(pending, { kind: 'insert', tableId: 't', tempId: 't1' }).inserts.map((row) => row.tempId)
    ).toEqual(['t2']);
    expect(
      removeChange(pending, { kind: 'update', tableId: 't', rowId: '1' }).updates
    ).toHaveLength(1);
    expect(removeChange(pending, { kind: 'delete', tableId: 't', rowId: '9' }).deletes).toEqual([]);
  });
});

describe('formatCellValue', () => {
  test('renders null, bool, objects, and truncates long text', () => {
    expect(formatCellValue(null)).toBe('NULL');
    expect(formatCellValue(true)).toBe('TRUE');
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
    expect(formatCellValue('x'.repeat(90))).toBe(`${'x'.repeat(77)}…`);
  });
});
