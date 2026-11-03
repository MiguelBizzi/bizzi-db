import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { buildSqlServerInsertSql } from './rowDml';

const table: TableSchema = {
  id: 'orders',
  schema: 'dbo',
  name: 'orders',
  rowCount: 0,
  sizeMb: 0,
  tags: [],
  createdAt: '',
  updatedAt: '',
  columns: [
    { name: 'id', type: 'int', isNullable: false, isPrimary: true, isUnique: false, identity: { seed: 1, increment: 1 } },
    { name: 'note', type: 'nvarchar(20)', isNullable: true, isPrimary: false, isUnique: false },
  ],
  indexes: [],
};

describe('sqlserver row dml', () => {
  test('wraps an explicit identity value in IDENTITY_INSERT', () => {
    const sql = buildSqlServerInsertSql(table, {
      id: { mode: 'value', input: '7' },
      note: { mode: 'value', input: 'hi' },
    });
    expect(sql.startsWith('SET IDENTITY_INSERT [dbo].[orders] ON;')).toBe(true);
    expect(sql).toContain('INSERT INTO [dbo].[orders] ([id], [note]) VALUES (7, N\'hi\');');
    expect(sql.endsWith('SET IDENTITY_INSERT [dbo].[orders] OFF;')).toBe(true);
  });

  test('omits the identity column when it is left as the default', () => {
    const sql = buildSqlServerInsertSql(table, {
      id: { mode: 'default', input: '' },
      note: { mode: 'default', input: '' },
    });
    expect(sql).toBe('INSERT INTO [dbo].[orders] DEFAULT VALUES;');
    expect(sql.includes('IDENTITY_INSERT')).toBe(false);
  });
});
