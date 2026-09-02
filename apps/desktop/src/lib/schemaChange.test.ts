import { describe, expect, test } from 'bun:test';
import { columnTypesFor } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  alterWarnings,
  buildAddColumnSql,
  buildAlterColumnSql,
  buildDropColumnSql,
  buildDropTableSql,
  buildTableDdlPreview,
  buildTruncateTableSql,
  canConfirmDelete,
  draftFromColumn,
  emptyColumnDraft,
  formatColumnType,
  typeChangeRisk,
  uniqueIndexName,
  validateColumnDraft,
  type ColumnDraft,
} from './schemaChange';

const types = columnTypesFor('PostgreSQL')!;

function column(name: string, extras: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

function table(
  name: string,
  columns: ColumnDefinition[],
  extras: Partial<TableSchema> = {}
): TableSchema {
  return {
    id: `shop.${name}`,
    name,
    schema: 'shop',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns,
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

function draft(extras: Partial<ColumnDraft> = {}): ColumnDraft {
  return {
    ...emptyColumnDraft(),
    name: 'nickname',
    typeId: 'text',
    ...extras,
  };
}

const organizations = table('organizations', [column('id', { type: 'bigint', isPrimary: true })]);
const users = table('users', [
  column('id', { type: 'bigint', isPrimary: true }),
  column('email', { type: 'text', isNullable: false, isUnique: true }),
]);

describe('formatColumnType', () => {
  test('applies varchar length and numeric precision/scale', () => {
    expect(formatColumnType(draft({ typeId: 'varchar', length: 100 }), types)).toBe('varchar(100)');
    expect(
      formatColumnType(draft({ typeId: 'numeric', precision: 12, scale: 4 }), types)
    ).toBe('numeric(12,4)');
    expect(formatColumnType(draft({ typeId: 'jsonb' }), types)).toBe('jsonb');
  });

  test('uses the custom type string as-is', () => {
    expect(
      formatColumnType(draft({ typeId: 'custom', customType: 'shop.user_role' }), types)
    ).toBe('shop.user_role');
  });
});

describe('validateColumnDraft', () => {
  test('requires a name, a type, and rejects duplicates', () => {
    expect(validateColumnDraft(draft({ name: '  ' }), users, types).name).toBeTruthy();
    expect(validateColumnDraft(draft({ name: 'email' }), users, types).name).toBeTruthy();
    expect(
      validateColumnDraft(draft({ name: 'email' }), users, types, { excludeName: 'email' }).name
    ).toBeUndefined();
    expect(validateColumnDraft(draft({ typeId: 'custom', customType: '' }), users, types).type).toBeTruthy();
  });

  test('requires varchar length and numeric precision', () => {
    expect(validateColumnDraft(draft({ typeId: 'varchar', length: 0 }), users, types).type).toBeTruthy();
    expect(
      validateColumnDraft(draft({ typeId: 'numeric', precision: 0, scale: 0 }), users, types).type
    ).toBeTruthy();
  });

  test('rejects a foreign key whose target does not exist', () => {
    const missing = validateColumnDraft(
      draft({
        foreignKey: {
          targetSchema: 'shop',
          targetTable: 'missing',
          targetColumn: 'id',
          onDelete: 'CASCADE',
        },
      }),
      users,
      types,
      { tables: [users, organizations] }
    );
    expect(missing.foreignKey).toBeTruthy();
    const ok = validateColumnDraft(
      draft({
        foreignKey: {
          targetSchema: 'shop',
          targetTable: 'organizations',
          targetColumn: 'id',
          onDelete: 'CASCADE',
        },
      }),
      users,
      types,
      { tables: [users, organizations] }
    );
    expect(ok.foreignKey).toBeUndefined();
  });
});

describe('buildAddColumnSql', () => {
  test('quotes schema, table, and column names including embedded quotes', () => {
    const sql = buildAddColumnSql(
      { schema: 'shop', name: 'we"ird' },
      draft({ name: 'a"b', typeId: 'integer' }),
      types
    );
    expect(sql).toBe('ALTER TABLE "shop"."we""ird" ADD COLUMN "a""b" integer;');
  });

  test('emits nullability, default, unique, check, and references', () => {
    const sql = buildAddColumnSql(
      users,
      draft({
        name: 'org_id',
        typeId: 'bigint',
        nullable: false,
        defaultValue: '0',
        unique: true,
        checkExpression: 'org_id > 0',
        foreignKey: {
          targetSchema: 'shop',
          targetTable: 'organizations',
          targetColumn: 'id',
          onDelete: 'CASCADE',
        },
      }),
      types
    );
    expect(sql).toBe(
      'ALTER TABLE "shop"."users" ADD COLUMN "org_id" bigint NOT NULL DEFAULT 0 UNIQUE CHECK (org_id > 0) REFERENCES "shop"."organizations" ("id") ON DELETE CASCADE;'
    );
  });
});

describe('buildDropColumnSql', () => {
  test('quotes identifiers and does not add CASCADE', () => {
    expect(buildDropColumnSql(users, 'email')).toBe(
      'ALTER TABLE "shop"."users" DROP COLUMN "email";'
    );
    expect(buildDropColumnSql({ schema: 's', name: 't"t' }, 'c"c')).toBe(
      'ALTER TABLE "s"."t""t" DROP COLUMN "c""c";'
    );
  });
});

describe('buildAlterColumnSql', () => {
  test('renames, changes type, nullability, and default as separate statements', () => {
    const current = column('bio', {
      type: 'text',
      isNullable: true,
      defaultValue: null,
    });
    const sql = buildAlterColumnSql(
      users,
      current,
      draft({
        name: 'about',
        typeId: 'varchar',
        length: 120,
        nullable: false,
        defaultValue: "'n/a'",
      }),
      types
    );
    expect(sql).toContain('ALTER TABLE "shop"."users" RENAME COLUMN "bio" TO "about";');
    expect(sql).toContain('ALTER COLUMN "about" TYPE varchar(120)');
    expect(sql).toContain('ALTER COLUMN "about" SET NOT NULL');
    expect(sql).toContain(`ALTER COLUMN "about" SET DEFAULT 'n/a'`);
  });

  test('drops a default and unique constraint; adds check and fk', () => {
    const current = column('email', {
      type: 'text',
      isNullable: false,
      isUnique: true,
      defaultValue: "'x'",
    });
    const withUnique = table('users', users.columns, {
      indexes: [{ name: 'users_email_key', columns: ['email'], isUnique: true, type: 'BTREE' }],
    });
    const sql = buildAlterColumnSql(
      withUnique,
      current,
      draft({
        name: 'email',
        typeId: 'text',
        nullable: false,
        defaultValue: '',
        unique: false,
        checkExpression: 'char_length(email) > 3',
        foreignKey: {
          targetSchema: 'shop',
          targetTable: 'organizations',
          targetColumn: 'id',
          onDelete: 'SET NULL',
        },
      }),
      types
    );
    expect(sql).toContain('ALTER COLUMN "email" DROP DEFAULT');
    expect(sql).toContain('DROP CONSTRAINT "users_email_key"');
    expect(sql).toContain('ADD CONSTRAINT "users_email_check" CHECK (char_length(email) > 3)');
    expect(sql).toContain(
      'ADD CONSTRAINT "users_email_fkey" FOREIGN KEY ("email") REFERENCES "shop"."organizations" ("id") ON DELETE SET NULL'
    );
  });

  test('returns empty when nothing changed', () => {
    const current = column('email', { type: 'text', isNullable: true });
    const sql = buildAlterColumnSql(users, current, draftFromColumn(current, types), types);
    expect(sql).toBe('');
  });
});

describe('typeChangeRisk', () => {
  test('same family is safe; cross-family text is lossy; bool to uuid is incompatible', () => {
    expect(typeChangeRisk('varchar(255)', 'text')).toBe('safe');
    expect(typeChangeRisk('integer', 'bigint')).toBe('safe');
    expect(typeChangeRisk('character varying(40)', 'integer')).toBe('lossy');
    expect(typeChangeRisk('boolean', 'uuid')).toBe('incompatible');
    expect(typeChangeRisk('jsonb', 'integer')).toBe('incompatible');
  });
});

describe('canConfirmDelete', () => {
  test('requires a trimmed case-sensitive match', () => {
    expect(canConfirmDelete('email', 'email')).toBe(true);
    expect(canConfirmDelete('  email  ', 'email')).toBe(true);
    expect(canConfirmDelete('Email', 'email')).toBe(false);
    expect(canConfirmDelete('', 'email')).toBe(false);
  });
});

describe('draftFromColumn / uniqueIndexName / alterWarnings', () => {
  test('maps introspected varchar and custom enum types', () => {
    const mapped = draftFromColumn(column('code', { type: 'character varying(40)' }), types);
    expect(mapped.typeId).toBe('varchar');
    expect(mapped.length).toBe(40);
    const role = draftFromColumn(column('role', { type: 'shop.user_role' }), types);
    expect(role.typeId).toBe('custom');
    expect(role.customType).toBe('shop.user_role');
  });

  test('finds a single-column unique index that is not the primary key', () => {
    const t = table('users', users.columns, {
      indexes: [
        { name: 'users_pkey', columns: ['id'], isUnique: true, type: 'BTREE' },
        { name: 'users_email_key', columns: ['email'], isUnique: true, type: 'BTREE' },
      ],
    });
    expect(uniqueIndexName(t, 'email')).toBe('users_email_key');
    expect(uniqueIndexName(t, 'id')).toBeUndefined();
  });

  test('warns on lossy type changes, tightening null, and dropping defaults', () => {
    const current = column('age', {
      type: 'text',
      isNullable: true,
      defaultValue: "'0'",
    });
    const warnings = alterWarnings(
      current,
      draft({ name: 'age', typeId: 'integer', nullable: false, defaultValue: '' }),
      types
    );
    expect(warnings.some((line) => /data loss|cannot be cast/i.test(line))).toBe(true);
    expect(warnings.some((line) => /NOT NULL/i.test(line))).toBe(true);
    expect(warnings.some((line) => /default/i.test(line))).toBe(true);
  });
});

describe('buildTableDdlPreview', () => {
  test('quotes identifiers in CREATE TABLE and indexes', () => {
    const t = table(
      'users',
      [
        column('id', { type: 'bigint', isPrimary: true, isNullable: false }),
        column('email', { type: 'text', isNullable: false, defaultValue: "''" }),
      ],
      {
        indexes: [{ name: 'users_email_idx', columns: ['email'], isUnique: true, type: 'BTREE' }],
      }
    );
    const ddl = buildTableDdlPreview(t);
    expect(ddl).toContain('CREATE TABLE "shop"."users"');
    expect(ddl).toContain('"id" bigint PRIMARY KEY NOT NULL');
    expect(ddl).toContain(`"email" text NOT NULL DEFAULT ''`);
    expect(ddl).toContain('CREATE UNIQUE INDEX "users_email_idx" ON "shop"."users" USING BTREE ("email")');
  });
});

describe('buildTruncateTableSql / buildDropTableSql', () => {
  test('quotes schema and table identifiers without CASCADE', () => {
    const users = table('users', [column('id')]);
    expect(buildTruncateTableSql(users)).toBe('TRUNCATE TABLE "shop"."users";');
    expect(buildDropTableSql(users)).toBe('DROP TABLE "shop"."users";');
  });

  test('escapes quotes inside identifiers', () => {
    const odd = table('we"ird', [column('id')], { schema: 'sch"ema' });
    expect(buildTruncateTableSql(odd)).toBe('TRUNCATE TABLE "sch""ema"."we""ird";');
    expect(buildDropTableSql(odd)).toBe('DROP TABLE "sch""ema"."we""ird";');
  });
});
