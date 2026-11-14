import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, FilterClause, TableSchema } from '../types';
import {
  buildSheetSql,
  canChooseReferencedRow,
  filterClauseSql,
  moveHighlight,
  searchTerms,
  sheetColumns,
} from './foreignKeySheet';

function column(name: string, extras: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

function table(name: string, columns: ColumnDefinition[]): TableSchema {
  return {
    id: `public.${name}`,
    name,
    schema: 'public',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns,
    indexes: [],
    createdAt: '',
    updatedAt: '',
  };
}

function clause(
  column: string,
  operator: FilterClause['operator'],
  value = '',
  enabled = true,
): FilterClause {
  return { id: column, column, operator, value, enabled };
}

const clients = table('clients', [
  column('id', { isPrimary: true, type: 'integer' }),
  column('created_at', { type: 'timestamp' }),
  column('profile', { type: 'jsonb' }),
  column('status'),
  column('email'),
  column('name'),
  column('notes'),
  column('country'),
  column('phone'),
]);

describe('sheetColumns', () => {
  test('puts the key first, then name-like columns, then the rest, skipping JSON', () => {
    expect(sheetColumns(clients, 'id')).toEqual([
      'id',
      'name',
      'email',
      'created_at',
      'status',
      'notes',
    ]);
  });

  test('skips SQL Server rowversion and image columns', () => {
    const t = table('docs', [
      column('id', { isPrimary: true }),
      column('row_version', { type: 'rowversion' }),
      column('scan', { type: 'image' }),
      column('title'),
    ]);
    expect(sheetColumns(t, 'id')).toEqual(['id', 'title']);
  });

  test('respects a smaller limit', () => {
    expect(sheetColumns(clients, 'id', 3)).toEqual(['id', 'name', 'email']);
  });

  test('keeps a non-primary target column first', () => {
    const t = table('users', [column('id', { isPrimary: true }), column('code')]);
    expect(sheetColumns(t, 'code')[0]).toBe('code');
  });
});

describe('searchTerms', () => {
  test('splits on whitespace and drops duplicates', () => {
    expect(searchTerms('  ada  Lovelace ada ')).toEqual(['ada', 'Lovelace']);
  });

  test('keeps a quoted phrase together', () => {
    expect(searchTerms('"ada lovelace" london')).toEqual(['ada lovelace', 'london']);
  });

  test('caps the number of terms', () => {
    expect(searchTerms('a b c d e f g')).toHaveLength(5);
  });

  test('empty input has no terms', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('""')).toEqual([]);
  });
});

describe('filterClauseSql', () => {
  test('comparison operators send an escaped literal', () => {
    expect(filterClauseSql('PostgreSQL', clause('name', '=', "O'Brien"))).toBe(
      `"name" = 'O''Brien'`,
    );
    expect(filterClauseSql('MySQL', clause('id', '>=', '10'))).toBe("`id` >= '10'");
  });

  test('IS NULL and IS NOT NULL take no value', () => {
    expect(filterClauseSql('SQLServer', clause('email', 'IS NULL'))).toBe('[email] IS NULL');
    expect(filterClauseSql('PostgreSQL', clause('email', 'IS NOT NULL'))).toBe(
      '"email" IS NOT NULL',
    );
  });

  test('IN splits on commas', () => {
    expect(filterClauseSql('PostgreSQL', clause('status', 'IN', 'active, paused'))).toBe(
      `"status" IN ('active', 'paused')`,
    );
  });

  test('ILIKE uses the engine case-insensitive match', () => {
    expect(filterClauseSql('MySQL', clause('name', 'ILIKE', 'ad%'))).toBe(
      "LOWER(CAST(`name` AS CHAR)) LIKE LOWER('ad%')",
    );
  });

  test('incomplete clauses produce nothing', () => {
    expect(filterClauseSql('PostgreSQL', clause('name', '=', ''))).toBeNull();
    expect(filterClauseSql('PostgreSQL', clause('name', 'IN', ' , '))).toBeNull();
  });
});

describe('buildSheetSql', () => {
  const users = table('users', [
    column('id', { isPrimary: true, type: 'uuid' }),
    column('email'),
    column('name'),
  ]);

  test('lists a page ordered by the key when there is no search', () => {
    expect(
      buildSheetSql({
        table: users,
        targetColumn: 'id',
        query: '',
        filters: [],
        offset: 0,
        limit: 50,
        dialect: 'PostgreSQL',
      }),
    ).toBe('SELECT "id", "name", "email" FROM "public"."users" ORDER BY "id" LIMIT 51;');
  });

  test('every term must match at least one shown column', () => {
    const sql = buildSheetSql({
      table: users,
      targetColumn: 'id',
      query: "ada o'b%",
      filters: [],
      offset: 50,
      limit: 50,
      dialect: 'PostgreSQL',
    });
    expect(sql).toBe(
      `SELECT "id", "name", "email" FROM "public"."users" WHERE ` +
        `(CAST("id" AS text) ILIKE '%ada%' ESCAPE '\\' OR CAST("name" AS text) ILIKE '%ada%' ESCAPE '\\' OR CAST("email" AS text) ILIKE '%ada%' ESCAPE '\\') AND ` +
        `(CAST("id" AS text) ILIKE '%o''b\\%%' ESCAPE '\\' OR CAST("name" AS text) ILIKE '%o''b\\%%' ESCAPE '\\' OR CAST("email" AS text) ILIKE '%o''b\\%%' ESCAPE '\\') ` +
        `ORDER BY "id" LIMIT 51 OFFSET 50;`,
    );
  });

  test('ANDs enabled filters with the search and ignores disabled or unknown columns', () => {
    const sql = buildSheetSql({
      table: users,
      targetColumn: 'id',
      query: '',
      filters: [
        clause('email', 'IS NOT NULL'),
        clause('name', '=', 'x', false),
        clause('missing', '=', 'x'),
      ],
      offset: 0,
      limit: 20,
      dialect: 'SQLServer',
    });
    expect(sql).toBe(
      'SELECT [id], [name], [email] FROM [public].[users] WHERE [email] IS NOT NULL ORDER BY [id] OFFSET 0 ROWS FETCH NEXT 21 ROWS ONLY;',
    );
  });
});

describe('moveHighlight', () => {
  test('clamps inside the list', () => {
    expect(moveHighlight(0, -1, 5)).toBe(0);
    expect(moveHighlight(4, 1, 5)).toBe(4);
    expect(moveHighlight(2, 10, 5)).toBe(4);
    expect(moveHighlight(3, 0, 0)).toBe(0);
  });
});

describe('canChooseReferencedRow', () => {
  const fk = column('client_id', {
    foreignKey: { targetTable: 'clients', targetColumn: 'id' },
  });

  test('only an editable foreign key cell on a live row qualifies', () => {
    expect(canChooseReferencedRow(fk, { locked: false, pendingDelete: false })).toBe(true);
    expect(canChooseReferencedRow(fk, { locked: true, pendingDelete: false })).toBe(false);
    expect(canChooseReferencedRow(fk, { locked: false, pendingDelete: true })).toBe(false);
    expect(canChooseReferencedRow(column('name'), { locked: false, pendingDelete: false })).toBe(
      false,
    );
    expect(canChooseReferencedRow(undefined, { locked: false, pendingDelete: false })).toBe(false);
  });
});
