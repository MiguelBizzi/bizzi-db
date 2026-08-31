import { describe, expect, test } from 'bun:test';
import {
  exportFileName,
  formatExport,
  inferQualifiedTable,
  sqlLiteral,
} from './dataExport';

const sample = {
  columns: ['id', 'name', 'active', 'note'],
  rows: [
    { id: 1, name: 'Ada', active: true, note: null },
    { id: 2, name: 'O\'Brien, Jr', active: false, note: 'line\nbreak' },
  ],
  schema: 'public',
  tableName: 'users',
};

describe('formatExport', () => {
  test('csv quotes commas, quotes, and newlines; leaves null empty', () => {
    const csv = formatExport(sample, 'csv');
    expect(csv).toBe(
      [
        'id,name,active,note',
        '1,Ada,true,',
        '2,"O\'Brien, Jr",false,"line\nbreak"',
      ].join('\n')
    );
  });

  test('json preserves types and null', () => {
    const parsed = JSON.parse(formatExport(sample, 'json'));
    expect(parsed).toEqual([
      { id: 1, name: 'Ada', active: true, note: null },
      { id: 2, name: "O'Brien, Jr", active: false, note: 'line\nbreak' },
    ]);
  });

  test('markdown builds a table and escapes pipes', () => {
    const md = formatExport(
      {
        columns: ['a', 'b'],
        rows: [{ a: 'x|y', b: null }],
      },
      'markdown'
    );
    expect(md).toBe(['| a | b |', '| --- | --- |', '| x\\|y |  |'].join('\n'));
  });

  test('sql emits a multi-row INSERT with typed literals', () => {
    const sql = formatExport(sample, 'sql');
    expect(sql).toBe(
      [
        'INSERT INTO "public"."users" ("id", "name", "active", "note") VALUES',
        "  (1, 'Ada', TRUE, NULL),",
        "  (2, 'O''Brien, Jr', FALSE, 'line\nbreak');",
      ].join('\n')
    );
  });
});

describe('sqlLiteral', () => {
  test('quotes strings and json, leaves numbers and null', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral(true)).toBe('TRUE');
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral({ a: 1 })).toBe(`'{"a":1}'`);
  });
});

describe('exportFileName', () => {
  test('uses short extensions including .md', () => {
    expect(exportFileName(sample, 'csv')).toBe('users_export.csv');
    expect(exportFileName(sample, 'markdown')).toBe('users_export.md');
    expect(exportFileName(sample, 'sql')).toBe('users_export.sql');
  });
});

describe('inferQualifiedTable', () => {
  test('reads schema-qualified FROM tables', () => {
    expect(inferQualifiedTable('SELECT * FROM "public"."orders" LIMIT 10')).toEqual({
      schema: 'public',
      table: 'orders',
    });
    expect(inferQualifiedTable('select id from users')).toEqual({
      schema: '',
      table: 'users',
    });
  });

  test('falls back when there is no FROM table', () => {
    expect(inferQualifiedTable('SELECT 1')).toEqual({
      schema: '',
      table: 'query_result',
    });
  });
});
