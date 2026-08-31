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

export function columnTypesFor(dialect: DatabaseDialect): ColumnTypeDef[] | undefined {
  if (dialect === 'PostgreSQL') return POSTGRES_COLUMN_TYPES;
  return undefined;
}
