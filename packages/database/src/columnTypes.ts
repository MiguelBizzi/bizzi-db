import type { DatabaseDialect } from '@db/shared';

export type ColumnTypeParams = 'none' | 'length' | 'precisionScale' | 'custom';

export type ColumnTypeFamily =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'bool'
  | 'uuid'
  | 'json'
  | 'temporal'
  | 'binary'
  | 'other';

export interface ColumnTypeDef {
  id: string;
  label: string;
  sqlName: string;
  family: ColumnTypeFamily;
  params: ColumnTypeParams;
  defaultLength?: number;
  /** Smallest accepted length. Defaults to 1. `0` allows an omitted fractional-seconds precision. */
  minLength?: number;
  maxLength?: number;
  defaultPrecision?: number;
  defaultScale?: number;
}

const POSTGRES_COLUMN_TYPES: ColumnTypeDef[] = [
  { id: 'text', label: 'text', sqlName: 'text', family: 'text', params: 'none' },
  {
    id: 'varchar',
    label: 'varchar',
    sqlName: 'varchar',
    family: 'text',
    params: 'length',
    defaultLength: 255,
  },
  {
    id: 'char',
    label: 'char',
    sqlName: 'char',
    family: 'text',
    params: 'length',
    defaultLength: 1,
  },
  { id: 'smallint', label: 'smallint', sqlName: 'smallint', family: 'integer', params: 'none' },
  { id: 'integer', label: 'integer', sqlName: 'integer', family: 'integer', params: 'none' },
  { id: 'bigint', label: 'bigint', sqlName: 'bigint', family: 'integer', params: 'none' },
  {
    id: 'smallserial',
    label: 'smallserial',
    sqlName: 'smallserial',
    family: 'integer',
    params: 'none',
  },
  { id: 'serial', label: 'serial', sqlName: 'serial', family: 'integer', params: 'none' },
  { id: 'bigserial', label: 'bigserial', sqlName: 'bigserial', family: 'integer', params: 'none' },
  {
    id: 'numeric',
    label: 'numeric',
    sqlName: 'numeric',
    family: 'decimal',
    params: 'precisionScale',
    defaultPrecision: 10,
    defaultScale: 2,
  },
  { id: 'real', label: 'real', sqlName: 'real', family: 'decimal', params: 'none' },
  {
    id: 'double precision',
    label: 'double precision',
    sqlName: 'double precision',
    family: 'decimal',
    params: 'none',
  },
  { id: 'boolean', label: 'boolean', sqlName: 'boolean', family: 'bool', params: 'none' },
  { id: 'uuid', label: 'uuid', sqlName: 'uuid', family: 'uuid', params: 'none' },
  { id: 'json', label: 'json', sqlName: 'json', family: 'json', params: 'none' },
  { id: 'jsonb', label: 'jsonb', sqlName: 'jsonb', family: 'json', params: 'none' },
  { id: 'date', label: 'date', sqlName: 'date', family: 'temporal', params: 'none' },
  { id: 'time', label: 'time', sqlName: 'time', family: 'temporal', params: 'none' },
  { id: 'timestamp', label: 'timestamp', sqlName: 'timestamp', family: 'temporal', params: 'none' },
  {
    id: 'timestamptz',
    label: 'timestamptz',
    sqlName: 'timestamptz',
    family: 'temporal',
    params: 'none',
  },
  { id: 'bytea', label: 'bytea', sqlName: 'bytea', family: 'binary', params: 'none' },
  { id: 'inet', label: 'inet', sqlName: 'inet', family: 'other', params: 'none' },
  { id: 'text[]', label: 'text[]', sqlName: 'text[]', family: 'other', params: 'none' },
  { id: 'integer[]', label: 'integer[]', sqlName: 'integer[]', family: 'other', params: 'none' },
  { id: 'custom', label: 'Custom…', sqlName: '', family: 'other', params: 'custom' },
];

const MYSQL_COLUMN_TYPES: ColumnTypeDef[] = [
  { id: 'tinyint', label: 'tinyint', sqlName: 'tinyint', family: 'integer', params: 'none' },
  { id: 'smallint', label: 'smallint', sqlName: 'smallint', family: 'integer', params: 'none' },
  { id: 'int', label: 'int', sqlName: 'int', family: 'integer', params: 'none' },
  { id: 'bigint', label: 'bigint', sqlName: 'bigint', family: 'integer', params: 'none' },
  { id: 'decimal', label: 'decimal', sqlName: 'decimal', family: 'decimal', params: 'precisionScale', defaultPrecision: 10, defaultScale: 2 },
  { id: 'float', label: 'float', sqlName: 'float', family: 'decimal', params: 'none' },
  { id: 'double', label: 'double', sqlName: 'double', family: 'decimal', params: 'none' },
  { id: 'bit', label: 'bit', sqlName: 'bit', family: 'other', params: 'length', defaultLength: 1 },
  { id: 'boolean', label: 'boolean', sqlName: 'boolean', family: 'bool', params: 'none' },
  { id: 'year', label: 'year', sqlName: 'year', family: 'temporal', params: 'none' },
  { id: 'date', label: 'date', sqlName: 'date', family: 'temporal', params: 'none' },
  { id: 'time', label: 'time', sqlName: 'time', family: 'temporal', params: 'length', minLength: 0, maxLength: 6 },
  { id: 'datetime', label: 'datetime', sqlName: 'datetime', family: 'temporal', params: 'length', minLength: 0, maxLength: 6 },
  { id: 'timestamp', label: 'timestamp', sqlName: 'timestamp', family: 'temporal', params: 'length', minLength: 0, maxLength: 6 },
  { id: 'char', label: 'char', sqlName: 'char', family: 'text', params: 'length', defaultLength: 1 },
  { id: 'varchar', label: 'varchar', sqlName: 'varchar', family: 'text', params: 'length', defaultLength: 255 },
  { id: 'text', label: 'text', sqlName: 'text', family: 'text', params: 'none' },
  { id: 'json', label: 'json', sqlName: 'json', family: 'json', params: 'none' },
  { id: 'binary', label: 'binary', sqlName: 'binary', family: 'binary', params: 'length', defaultLength: 16 },
  { id: 'varbinary', label: 'varbinary', sqlName: 'varbinary', family: 'binary', params: 'length', defaultLength: 255 },
  { id: 'blob', label: 'blob', sqlName: 'blob', family: 'binary', params: 'none' },
  { id: 'enum', label: 'enum', sqlName: 'enum', family: 'other', params: 'custom' },
  { id: 'custom', label: 'Custom…', sqlName: '', family: 'other', params: 'custom' },
];

const SQLSERVER_COLUMN_TYPES: ColumnTypeDef[] = [
  { id: 'int', label: 'int', sqlName: 'int', family: 'integer', params: 'none' },
  { id: 'bigint', label: 'bigint', sqlName: 'bigint', family: 'integer', params: 'none' },
  { id: 'smallint', label: 'smallint', sqlName: 'smallint', family: 'integer', params: 'none' },
  { id: 'tinyint', label: 'tinyint', sqlName: 'tinyint', family: 'integer', params: 'none' },
  { id: 'bit', label: 'bit', sqlName: 'bit', family: 'bool', params: 'none' },
  { id: 'decimal', label: 'decimal', sqlName: 'decimal', family: 'decimal', params: 'precisionScale', defaultPrecision: 18, defaultScale: 2 },
  { id: 'numeric', label: 'numeric', sqlName: 'numeric', family: 'decimal', params: 'precisionScale', defaultPrecision: 18, defaultScale: 2 },
  { id: 'money', label: 'money', sqlName: 'money', family: 'decimal', params: 'none' },
  { id: 'float', label: 'float', sqlName: 'float', family: 'decimal', params: 'none' },
  { id: 'real', label: 'real', sqlName: 'real', family: 'decimal', params: 'none' },
  { id: 'nvarchar', label: 'nvarchar', sqlName: 'nvarchar', family: 'text', params: 'length', defaultLength: 50, maxLength: 4000 },
  { id: 'nvarchar(max)', label: 'nvarchar(max)', sqlName: 'nvarchar(max)', family: 'text', params: 'none' },
  { id: 'varchar', label: 'varchar', sqlName: 'varchar', family: 'text', params: 'length', defaultLength: 50, maxLength: 8000 },
  { id: 'varchar(max)', label: 'varchar(max)', sqlName: 'varchar(max)', family: 'text', params: 'none' },
  { id: 'datetime2', label: 'datetime2', sqlName: 'datetime2', family: 'temporal', params: 'length', minLength: 0, maxLength: 7 },
  { id: 'date', label: 'date', sqlName: 'date', family: 'temporal', params: 'none' },
  { id: 'time', label: 'time', sqlName: 'time', family: 'temporal', params: 'length', minLength: 0, maxLength: 7 },
  { id: 'datetimeoffset', label: 'datetimeoffset', sqlName: 'datetimeoffset', family: 'temporal', params: 'length', minLength: 0, maxLength: 7 },
  { id: 'uniqueidentifier', label: 'uniqueidentifier', sqlName: 'uniqueidentifier', family: 'uuid', params: 'none' },
  { id: 'varbinary', label: 'varbinary', sqlName: 'varbinary', family: 'binary', params: 'length', defaultLength: 50, maxLength: 8000 },
  { id: 'varbinary(max)', label: 'varbinary(max)', sqlName: 'varbinary(max)', family: 'binary', params: 'none' },
  { id: 'xml', label: 'xml', sqlName: 'xml', family: 'other', params: 'none' },
  { id: 'rowversion', label: 'rowversion', sqlName: 'rowversion', family: 'binary', params: 'none' },
  { id: 'custom', label: 'Custom…', sqlName: '', family: 'other', params: 'custom' },
];

const COLUMN_TYPES: Partial<Record<DatabaseDialect, ColumnTypeDef[]>> = {
  PostgreSQL: POSTGRES_COLUMN_TYPES,
  MySQL: MYSQL_COLUMN_TYPES,
  SQLServer: SQLSERVER_COLUMN_TYPES,
};

export function columnTypesFor(dialect: DatabaseDialect): ColumnTypeDef[] | undefined {
  return COLUMN_TYPES[dialect];
}
