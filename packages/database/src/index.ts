import type { DatabaseDialect } from '@db/shared';
import { POSTGRES_OBJECTS, type ObjectCapabilities } from './objects';

export {
  columnTypesFor,
  type ColumnTypeDef,
  type ColumnTypeFamily,
  type ColumnTypeParams,
} from './columnTypes';
export {
  indexMethod,
  methodSupportsInclude,
  POSTGRES_OBJECTS,
  storageParamsFor,
  versionAtLeast,
  type IndexCapabilities,
  type IndexMethodSpec,
  type ObjectCapabilities,
  type RoutineCapabilities,
  type StorageParamSpec,
} from './objects';

export interface DialectMeta {
  id: DatabaseDialect;
  label: string;
  defaultPort: number;
  defaultSsl: boolean;
  quoteIdent: (name: string) => string;
  quoteLiteral: (value: string) => string;
  objects: ObjectCapabilities;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteSqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const DIALECTS: Record<'PostgreSQL', DialectMeta> = {
  PostgreSQL: {
    id: 'PostgreSQL',
    label: 'PostgreSQL',
    defaultPort: 5432,
    defaultSsl: false,
    quoteIdent: quoteSqlIdent,
    quoteLiteral: quoteSqlLiteral,
    objects: POSTGRES_OBJECTS,
  },
};

export const SUPPORTED_DIALECTS: DialectMeta[] = [DIALECTS.PostgreSQL];

export function dialectMeta(id: DatabaseDialect): DialectMeta | undefined {
  if (id === 'PostgreSQL') return DIALECTS.PostgreSQL;
  return undefined;
}
