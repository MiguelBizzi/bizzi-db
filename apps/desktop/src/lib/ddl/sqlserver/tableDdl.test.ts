import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../../../types';
import type { ColumnDraft, NewTableColumn } from '../../schemaChange';
import {
  buildAlterColumnSql,
  buildCreateTableSql,
  buildDropColumnSql,
  buildDropTableSql,
  buildTruncateTableSql,
} from './tableDdl';

const types = [
  { id: 'nvarchar', label: 'nvarchar', sqlName: 'nvarchar', family: 'text' as const, params: 'length' as const, defaultLength: 50 },
  { id: 'int', label: 'int', sqlName: 'int', family: 'integer' as const, params: 'none' as const },
];

function column(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name: 'email',
    type: 'nvarchar(50)',
    isNullable: true,
    isPrimary: false,
    isUnique: false,
    ...overrides,
  };
}

function draft(overrides: Partial<ColumnDraft> = {}): ColumnDraft {
  return {
    name: 'email',
    typeId: 'nvarchar',
    length: 50,
    nullable: true,
    unique: false,
    defaultValue: '',
    checkExpression: '',
    foreignKey: null,
    ...overrides,
  };
}

const table: TableSchema = {
  id: 'users',
  schema: 'dbo',
  name: 'users',
  rowCount: 0,
  sizeMb: 0,
  tags: [],
  createdAt: '',
  updatedAt: '',
  columns: [
    column({ name: 'id', type: 'int', isNullable: false, isPrimary: true, identity: { seed: 1, increment: 1 } }),
    column({ defaultConstraint: 'df_users_email' }),
  ],
  indexes: [
    { name: 'users_email', columns: ['email'], isUnique: false, type: 'nonclustered' },
  ],
};

describe('sqlserver table ddl', () => {
  test('quotes identifiers with brackets', () => {
    const id: NewTableColumn = {
      ...draft({ name: 'id', typeId: 'int', nullable: false }),
      primaryKey: true,
    };
    const sql = buildCreateTableSql({ schema: 'dbo', name: 'order' }, [id], types);
    expect(sql).toContain('[dbo].[order]');
    expect(sql).toContain('[id] int NOT NULL');
    expect(sql).toContain('PRIMARY KEY ([id])');
  });

  test('renames with sp_rename and restates type and nullability', () => {
    const sql = buildAlterColumnSql(
      table,
      column(),
      draft({ name: 'mail', length: 80, nullable: false }),
      types,
    );
    expect(sql).toContain('sp_rename');
    expect(sql).toContain("N'COLUMN'");
    expect(sql).toContain('ALTER COLUMN [mail] nvarchar(80) NOT NULL');
  });

  test('drops and recreates a named default around an alter', () => {
    const sql = buildAlterColumnSql(
      table,
      column({ defaultValue: '0', defaultConstraint: 'df_users_email' }),
      draft({ nullable: false, defaultValue: 'none' }),
      types,
    );
    expect(sql).toContain('DROP CONSTRAINT [df_users_email]');
    expect(sql).toContain('ALTER COLUMN [email] nvarchar(50) NOT NULL');
    expect(sql).toContain("ADD CONSTRAINT [df_users_email] DEFAULT (N'none') FOR [email]");
  });

  test('refuses to alter an identity column', () => {
    const sql = buildAlterColumnSql(
      table,
      column({ name: 'id', type: 'int', isNullable: false, identity: { seed: 1, increment: 1 } }),
      draft({ name: 'id', typeId: 'int', nullable: true }),
      types,
    );
    expect(sql).toBe('');
  });

  test('drops the default and indexes that depend on a column before the column', () => {
    const sql = buildDropColumnSql(table, 'email');
    const dropColumn = sql.indexOf('DROP COLUMN [email]');
    expect(sql.indexOf('DROP CONSTRAINT [df_users_email]')).toBeLessThan(dropColumn);
    expect(sql.indexOf('DROP INDEX [users_email]')).toBeLessThan(dropColumn);
    expect(sql).toContain('DROP INDEX [users_email] ON [dbo].[users]');
  });

  test('truncate and drop are schema-qualified', () => {
    expect(buildTruncateTableSql(table)).toBe('TRUNCATE TABLE [dbo].[users];');
    expect(buildDropTableSql(table)).toBe('DROP TABLE [dbo].[users];');
  });
});
