import { describe, expect, test } from 'bun:test';
import { columnTypesFor } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../../../types';
import type { ColumnDraft } from '../../schemaChange';
import {
  buildAlterColumnSql,
  buildCreateTableSql,
  buildDropTableSql,
  buildTableDdlPreview,
} from './tableDdl';

const types = columnTypesFor('MySQL') ?? [];

function draft(overrides: Partial<ColumnDraft> = {}): ColumnDraft {
  return {
    name: 'email',
    typeId: 'varchar',
    length: 255,
    nullable: false,
    defaultValue: '',
    unique: false,
    checkExpression: '',
    foreignKey: null,
    ...overrides,
  };
}

const users = {
  schema: 'shop',
  name: 'users',
  columns: [] as ColumnDefinition[],
  indexes: [],
} as unknown as TableSchema;

describe('mysql table ddl', () => {
  test('creates an InnoDB table and quotes backticks', () => {
    const sql = buildCreateTableSql(
      { schema: 'shop', name: 'we`ird' },
      [{ ...draft({ name: 'id', typeId: 'bigint', nullable: false, defaultValue: 'AUTO_INCREMENT' }), primaryKey: true }],
      types,
    );
    expect(sql).toContain('CREATE TABLE `shop`.`we``ird`');
    expect(sql).toContain('`id` bigint NOT NULL AUTO_INCREMENT');
    expect(sql).toContain('ENGINE=InnoDB');
  });

  test('restates the column with MODIFY and renames separately', () => {
    const current: ColumnDefinition = {
      name: 'email',
      type: 'varchar(255)',
      isNullable: true,
      defaultValue: '',
    };
    const sql = buildAlterColumnSql(
      users,
      current,
      draft({ name: 'email_address', nullable: false, defaultValue: "''" }),
      types,
    );
    expect(sql).toContain('RENAME COLUMN `email` TO `email_address`');
    expect(sql).toContain('MODIFY COLUMN `email_address` varchar(255) NOT NULL DEFAULT \'\'');
  });

  test('drops and previews with backticks', () => {
    expect(buildDropTableSql({ schema: 'shop', name: 'order' })).toBe('DROP TABLE `shop`.`order`;');
    const preview = buildTableDdlPreview({
      ...users,
      columns: [{ name: 'id', type: 'bigint', isPrimary: true, isNullable: false }],
    });
    expect(preview).toContain('CREATE TABLE `shop`.`users`');
    expect(preview).toContain('ENGINE=InnoDB');
  });
});
