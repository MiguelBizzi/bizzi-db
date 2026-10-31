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

  test('keeps a comment and ON UPDATE, and refuses a generated column', () => {
    const current: ColumnDefinition = {
      name: 'touched_at',
      type: 'datetime(6)',
      isNullable: false,
      defaultValue: 'CURRENT_TIMESTAMP(6)',
      comment: 'last write',
      onUpdate: 'CURRENT_TIMESTAMP(6)',
    };
    const sql = buildAlterColumnSql(
      users,
      current,
      draft({ name: 'touched_at', typeId: 'datetime', length: 6, nullable: false, defaultValue: 'CURRENT_TIMESTAMP(6)' }),
      types,
    );
    expect(sql).toBe('');
    const changed = buildAlterColumnSql(
      users,
      current,
      draft({ name: 'touched_at', typeId: 'datetime', length: 0, nullable: false, defaultValue: 'CURRENT_TIMESTAMP(6)' }),
      types,
    );
    expect(changed).toContain('MODIFY COLUMN `touched_at` datetime(0) NOT NULL');
    expect(changed).toContain('DEFAULT CURRENT_TIMESTAMP(0)');
    expect(changed).toContain('ON UPDATE CURRENT_TIMESTAMP(0)');
    expect(changed).toContain("COMMENT 'last write'");
    expect(
      buildAlterColumnSql(users, { ...current, generated: 'upper(body)' }, draft(), types),
    ).toBe('');
  });

  test('drops a foreign key by its real name and adds a check without dropping one', () => {
    const current: ColumnDefinition = {
      name: 'user_id',
      type: 'bigint',
      isNullable: false,
      foreignKey: {
        name: 'audit_notes_ibfk_1',
        targetSchema: 'shop',
        targetTable: 'users',
        targetColumn: 'id',
        onDelete: 'RESTRICT',
      },
    };
    const sql = buildAlterColumnSql(
      users,
      current,
      draft({
        name: 'user_id',
        typeId: 'bigint',
        nullable: false,
        checkExpression: 'user_id > 0',
        foreignKey: {
          targetSchema: 'shop',
          targetTable: 'users',
          targetColumn: 'id',
          onDelete: 'CASCADE',
        },
      }),
      types,
    );
    expect(sql).toContain('DROP FOREIGN KEY `audit_notes_ibfk_1`');
    expect(sql).toContain('ADD CONSTRAINT `audit_notes_ibfk_1` FOREIGN KEY');
    expect(sql).toContain('ADD CONSTRAINT `users_user_id_check` CHECK (user_id > 0)');
    expect(sql).not.toContain('DROP CHECK');
  });

  test('drops and previews with backticks', () => {
    expect(buildDropTableSql({ schema: 'shop', name: 'order' })).toBe('DROP TABLE `shop`.`order`;');
    const preview = buildTableDdlPreview({
      ...users,
      columns: [{ name: 'id', type: 'bigint', isPrimary: true, isNullable: false }],
    });
    expect(preview).toContain('CREATE TABLE `shop`.`users`');
    expect(preview).toContain('ENGINE=InnoDB');
    expect(preview).toContain('PRIMARY KEY (`id`)');
    expect(preview).toContain('`id` bigint NOT NULL');
    expect(preview).not.toContain('DEFAULT AUTO_INCREMENT');
    const composite = buildTableDdlPreview({
      ...users,
      columns: [
        { name: 'a', type: 'int', isPrimary: true, isNullable: false },
        { name: 'b', type: 'int', isPrimary: true, isNullable: false, defaultValue: 'AUTO_INCREMENT' },
      ],
    });
    expect(composite).toContain('PRIMARY KEY (`a`, `b`)');
    expect(composite).toContain('`b` int NOT NULL AUTO_INCREMENT');
  });
});
