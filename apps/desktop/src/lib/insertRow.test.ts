import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  assignmentFromField,
  buildInsertSql,
  enumValuesFor,
  fieldError,
  hasDefault,
  initialFieldState,
  initialFields,
  isBooleanType,
  isDecimalType,
  isIntegerType,
  isJsonType,
  isLongTextType,
  isNullable,
  isRequired,
  isTimestampType,
  validateFields,
} from './insertRow';

function column(name: string, extras: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

function users(columns: ColumnDefinition[]): TableSchema {
  return {
    id: 'public.users',
    name: 'users',
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

describe('type helpers', () => {
  test('classifies postgres-ish type names', () => {
    expect(isTimestampType('timestamptz')).toBe(true);
    expect(isTimestampType('date')).toBe(true);
    expect(isBooleanType('bool')).toBe(true);
    expect(isIntegerType('int4')).toBe(true);
    expect(isIntegerType('bigserial')).toBe(true);
    expect(isDecimalType('numeric')).toBe(true);
    expect(isJsonType('jsonb')).toBe(true);
    expect(isLongTextType('text')).toBe(true);
    expect(isLongTextType('jsonb')).toBe(true);
  });
});

describe('enumValuesFor', () => {
  test('prefers enumValues then parses enum(...) from the type', () => {
    expect(enumValuesFor(column('role', { enumValues: ['admin', 'staff'] }))).toEqual([
      'admin',
      'staff',
    ]);
    expect(enumValuesFor(column('role', { type: "enum ('a', 'b')" }))).toEqual(['a', 'b']);
    expect(enumValuesFor(column('role'))).toEqual([]);
  });
});

describe('required / initial state', () => {
  test('required columns start in value mode; defaults and nullables do not', () => {
    const required = column('email', { isNullable: false });
    const withDefault = column('role', { defaultValue: 'customer', isNullable: false });
    const optional = column('bio', { isNullable: true });
    expect(isRequired(required)).toBe(true);
    expect(hasDefault(withDefault)).toBe(true);
    expect(isNullable(optional)).toBe(true);
    expect(initialFieldState(required)).toEqual({ mode: 'value', input: '' });
    expect(initialFieldState(withDefault)).toEqual({ mode: 'default', input: '' });
    expect(initialFieldState(optional)).toEqual({ mode: 'null', input: '' });
    expect(initialFields([required, optional]).email.mode).toBe('value');
  });
});

describe('fieldError / validateFields', () => {
  test('skips validation for default, null, and now modes', () => {
    const required = column('email', { isNullable: false });
    expect(fieldError(required, { mode: 'default', input: '' })).toBeNull();
    expect(fieldError(required, { mode: 'null', input: '' })).toBeNull();
    expect(fieldError(required, { mode: 'now', input: '' })).toBeNull();
  });

  test('rejects empty required values and mistyped input', () => {
    const required = column('email', { isNullable: false });
    const role = column('role', { enumValues: ['admin', 'staff'] });
    const flag = column('active', { type: 'boolean' });
    const age = column('age', { type: 'int4' });
    const price = column('price', { type: 'numeric' });
    const meta = column('meta', { type: 'jsonb' });
    expect(fieldError(required, { mode: 'value', input: '  ' })).toBe('This field is required');
    expect(fieldError(role, { mode: 'value', input: 'nope' })).toBe('Select a valid value');
    expect(fieldError(flag, { mode: 'value', input: 'yes' })).toBe('Invalid data type');
    expect(fieldError(age, { mode: 'value', input: '1.5' })).toBe('Invalid data type');
    expect(fieldError(price, { mode: 'value', input: 'x' })).toBe('Invalid data type');
    expect(fieldError(meta, { mode: 'value', input: '{bad' })).toBe('Invalid data type');
    expect(fieldError(age, { mode: 'value', input: '3' })).toBeNull();
    expect(fieldError(meta, { mode: 'value', input: '{"a":1}' })).toBeNull();
    expect(validateFields([required, age], { email: { mode: 'value', input: '' } })).toEqual({
      email: 'This field is required',
    });
  });
});

describe('assignmentFromField / buildInsertSql', () => {
  test('omits defaults, emits now(), and quotes literals', () => {
    const created = column('created_at', { type: 'timestamptz', defaultValue: 'now()' });
    const name = column('name', { isNullable: false });
    const active = column('active', { type: 'boolean' });
    expect(assignmentFromField(created, { mode: 'default', input: '' })).toEqual({ kind: 'omit' });
    expect(assignmentFromField(created, { mode: 'now', input: '' })).toEqual({
      kind: 'expr',
      sql: 'now()',
    });
    expect(assignmentFromField(name, { mode: 'null', input: '' })).toEqual({ kind: 'null' });
    expect(assignmentFromField(active, { mode: 'value', input: 'true' })).toEqual({
      kind: 'literal',
      value: true,
    });

    const sql = buildInsertSql(users([created, name, active]), {
      created_at: { mode: 'now', input: '' },
      name: { mode: 'value', input: "O'Brien" },
      active: { mode: 'value', input: 'false' },
    });
    expect(sql).toBe(
      `INSERT INTO "public"."users" ("created_at", "name", "active") VALUES (now(), 'O''Brien', FALSE);`
    );
  });

  test('emits DEFAULT VALUES when every column is omitted', () => {
    const id = column('id', { type: 'int4', isPrimary: true, defaultValue: 'nextval' });
    expect(buildInsertSql(users([id]), { id: { mode: 'default', input: '' } })).toBe(
      'INSERT INTO "public"."users" DEFAULT VALUES;'
    );
  });
});
