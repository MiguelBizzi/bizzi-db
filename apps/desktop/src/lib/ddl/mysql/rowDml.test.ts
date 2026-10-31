import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { buildMysqlInsertSql } from './rowDml';

const table = {
  schema: 'shop',
  name: 'users',
  columns: [
    { name: 'id', type: 'bigint' },
    { name: 'active', type: 'tinyint(1)' },
  ],
} as TableSchema;

describe('mysql row dml', () => {
  test('uses backticks and an empty column list', () => {
    const sql = buildMysqlInsertSql(table, {
      id: { mode: 'default', input: '' },
      active: { mode: 'default', input: '' },
    });
    expect(sql).toBe('INSERT INTO `shop`.`users` () VALUES ();');
  });
});
