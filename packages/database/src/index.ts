import type { DatabaseDialect } from '@db/shared';
import { MYSQL_OBJECTS, POSTGRES_OBJECTS, type ObjectCapabilities } from './objects';

export {
  columnTypesFor,
  type ColumnTypeDef,
  type ColumnTypeFamily,
  type ColumnTypeParams,
} from './columnTypes';
export {
  indexMethod,
  methodSupportsInclude,
  MYSQL_OBJECTS,
  POSTGRES_OBJECTS,
  storageParamsFor,
  versionAtLeast,
  type IndexCapabilities,
  type IndexMethodSpec,
  type ObjectCapabilities,
  type RoutineCapabilities,
  type StorageParamSpec,
} from './objects';

/** What the product may offer for an engine. False hides the control. */
export interface EngineCapabilities {
  transactionalDdl: boolean;
  materializedViews: boolean;
  routineOverloading: boolean;
  orReplaceRoutines: boolean;
  partialIndexes: boolean;
  /** `CONCURRENTLY` on Postgres, `ALGORITHM=INPLACE` on MySQL. */
  onlineIndexBuild: boolean;
  explainPlanTree: boolean;
  routines: boolean;
  /** The connection's database field may be blank (MySQL lists every schema). */
  emptyDatabaseAllowed: boolean;
  dollarQuotes: boolean;
  hashComments: boolean;
  backtickIdents: boolean;
  /** `ILIKE`. When false, case-insensitive match is `LOWER(col) LIKE LOWER(pattern)`. */
  ilike: boolean;
  /** Postgres `INVALID` indexes. MySQL has no such state. */
  invalidIndexes: boolean;
}

export interface DialectMeta {
  id: DatabaseDialect;
  label: string;
  defaultPort: number;
  defaultUser: string;
  defaultDatabase: string;
  /** Schema suggested when creating an object. */
  defaultSchema: string;
  defaultSsl: boolean;
  uriSchemes: string[];
  formatterLanguage: 'postgresql' | 'mysql';
  /** `@codemirror/lang-sql` dialect. */
  editorDialect: 'PostgreSQL' | 'MySQL';
  quoteIdent: (name: string) => string;
  quoteLiteral: (value: string) => string;
  booleanLiteral: (value: boolean) => string;
  /** Statement used for `INSERT` of a row with no columns. */
  emptyInsert: string;
  /** A `\x` hex payload from a binary cell, as a SQL literal. */
  byteaLiteral: (hex: string) => string;
  defaultPresets: { label: string; sql: string }[];
  objects: ObjectCapabilities;
  capabilities: EngineCapabilities;
}

export type DialectModule = DialectMeta;

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteSqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteMysqlIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

const POSTGRES_PRESETS = [
  { label: 'NULL', sql: 'NULL' },
  { label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  { label: 'now()', sql: 'now()' },
  { label: 'gen_random_uuid()', sql: 'gen_random_uuid()' },
  { label: 'true', sql: 'true' },
  { label: 'false', sql: 'false' },
];

const MYSQL_PRESETS = [
  { label: 'NULL', sql: 'NULL' },
  { label: 'CURRENT_TIMESTAMP', sql: 'CURRENT_TIMESTAMP' },
  { label: '(UUID())', sql: '(UUID())' },
  { label: 'TRUE', sql: 'TRUE' },
  { label: 'FALSE', sql: 'FALSE' },
];

export const DIALECTS: Record<'PostgreSQL' | 'MySQL', DialectMeta> = {
  PostgreSQL: {
    id: 'PostgreSQL',
    label: 'PostgreSQL',
    defaultPort: 5432,
    defaultUser: 'postgres',
    defaultDatabase: 'postgres',
    defaultSchema: 'public',
    defaultSsl: false,
    uriSchemes: ['postgres', 'postgresql'],
    formatterLanguage: 'postgresql',
    editorDialect: 'PostgreSQL',
    quoteIdent: quoteSqlIdent,
    quoteLiteral: quoteSqlLiteral,
    booleanLiteral: (value) => (value ? 'TRUE' : 'FALSE'),
    emptyInsert: 'DEFAULT VALUES',
    byteaLiteral: (hex) => `'\\x${hex}'`,
    defaultPresets: POSTGRES_PRESETS,
    objects: POSTGRES_OBJECTS,
    capabilities: {
      transactionalDdl: true,
      materializedViews: true,
      routineOverloading: true,
      orReplaceRoutines: true,
      partialIndexes: true,
      onlineIndexBuild: true,
      explainPlanTree: true,
      routines: true,
      emptyDatabaseAllowed: false,
      dollarQuotes: true,
      hashComments: false,
      backtickIdents: false,
      ilike: true,
      invalidIndexes: true,
    },
  },
  MySQL: {
    id: 'MySQL',
    label: 'MySQL',
    defaultPort: 3306,
    defaultUser: 'root',
    defaultDatabase: '',
    defaultSchema: '',
    defaultSsl: false,
    uriSchemes: ['mysql', 'mysql2'],
    formatterLanguage: 'mysql',
    editorDialect: 'MySQL',
    quoteIdent: quoteMysqlIdent,
    quoteLiteral: quoteSqlLiteral,
    booleanLiteral: (value) => (value ? 'TRUE' : 'FALSE'),
    emptyInsert: '() VALUES ()',
    byteaLiteral: (hex) => `X'${hex}'`,
    defaultPresets: MYSQL_PRESETS,
    objects: MYSQL_OBJECTS,
    capabilities: {
      transactionalDdl: false,
      materializedViews: false,
      routineOverloading: false,
      orReplaceRoutines: false,
      partialIndexes: false,
      onlineIndexBuild: true,
      explainPlanTree: false,
      routines: true,
      emptyDatabaseAllowed: true,
      dollarQuotes: false,
      hashComments: true,
      backtickIdents: true,
      ilike: false,
      invalidIndexes: false,
    },
  },
};

export const SUPPORTED_DIALECTS: DialectMeta[] = [DIALECTS.PostgreSQL, DIALECTS.MySQL];

export function dialectMeta(id: DatabaseDialect): DialectModule | undefined {
  if (id === 'PostgreSQL') return DIALECTS.PostgreSQL;
  if (id === 'MySQL') return DIALECTS.MySQL;
  return undefined;
}

export function dialectModule(id: DatabaseDialect): DialectModule | undefined {
  return dialectMeta(id);
}
