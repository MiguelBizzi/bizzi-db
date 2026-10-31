import type { ParameterMode, RoutineKind } from '@db/shared';

export interface StorageParamSpec {
  name: string;
  kind: 'integer' | 'boolean' | 'enum';
  /** For `enum`. */
  values?: string[];
  min?: number;
  max?: number;
  /** Server version that introduced it, as `server_version_num`. */
  minVersion?: number;
  hint: string;
}

export interface IndexMethodSpec {
  /** Name as written after `USING`, lower case. */
  id: string;
  label: string;
  description: string;
  unique: boolean;
  /** ASC/DESC and NULLS FIRST/LAST per key. */
  ordering: boolean;
  multiColumn: boolean;
  /** Minimum version for `INCLUDE`, or `null` when the method never supports it. */
  includeMinVersion: number | null;
  storageParams: StorageParamSpec[];
}

export interface IndexCapabilities {
  methods: IndexMethodSpec[];
  defaultMethod: string;
  expressions: boolean;
  partial: boolean;
  concurrent: boolean;
  ifNotExists: boolean;
  tablespaces: boolean;
  opclasses: boolean;
  collations: boolean;
  /** Minimum version for `NULLS NOT DISTINCT`, or `null` when unsupported. */
  nullsNotDistinctMinVersion: number | null;
  /** Longest identifier, in bytes. */
  maxNameBytes: number;
  /** Label of the non-blocking build option. Defaults to `CONCURRENTLY`. */
  onlineBuildLabel?: string;
  onlineBuildHint?: string;
}

export interface RoutineCapabilities {
  kinds: RoutineKind[];
  /** Body, language and attributes can change without dropping. */
  createOrReplace: boolean;
  parameterModes: ParameterMode[];
  /** `RETURNS TABLE (...)`. */
  returnsTable: boolean;
  volatilities: Array<'immutable' | 'stable' | 'volatile'>;
  defaultVolatility: 'immutable' | 'stable' | 'volatile';
  /** Empty when the dialect has no parallel-safety marking. */
  parallelModes: Array<'safe' | 'restricted' | 'unsafe'>;
  strict: boolean;
  securityDefiner: boolean;
  leakproof: boolean;
  costAndRows: boolean;
  defaultLanguage: string;
  returnTypePresets: string[];
  /** Show DETERMINISTIC instead of the volatility list. */
  deterministic?: boolean;
  /** Empty hides the control. MySQL data-access characteristics. */
  dataAccessModes?: Array<'CONTAINS SQL' | 'NO SQL' | 'READS SQL DATA' | 'MODIFIES SQL DATA'>;
  /** When set, functions only offer these modes. Procedures use `parameterModes`. */
  functionParameterModes?: ParameterMode[];
}

export interface ObjectCapabilities {
  indexes: IndexCapabilities;
  routines: RoutineCapabilities;
}

const FILLFACTOR: StorageParamSpec = {
  name: 'fillfactor',
  kind: 'integer',
  min: 10,
  max: 100,
  hint: 'Percent of each page to fill; leave room for updates.',
};

export const POSTGRES_OBJECTS: ObjectCapabilities = {
  indexes: {
    methods: [
      {
        id: 'btree',
        label: 'B-tree',
        description: 'Equality and range lookups, sorting. The default.',
        unique: true,
        ordering: true,
        multiColumn: true,
        includeMinVersion: 110_000,
        storageParams: [
          FILLFACTOR,
          {
            name: 'deduplicate_items',
            kind: 'boolean',
            minVersion: 130_000,
            hint: 'Store duplicate keys once (smaller index).',
          },
        ],
      },
      {
        id: 'hash',
        label: 'Hash',
        description: 'Equality lookups only.',
        unique: false,
        ordering: false,
        multiColumn: false,
        includeMinVersion: null,
        storageParams: [FILLFACTOR],
      },
      {
        id: 'gist',
        label: 'GiST',
        description: 'Geometric, range and full-text search; nearest neighbour.',
        unique: false,
        ordering: false,
        multiColumn: true,
        includeMinVersion: 120_000,
        storageParams: [
          FILLFACTOR,
          {
            name: 'buffering',
            kind: 'enum',
            values: ['auto', 'on', 'off'],
            hint: 'Buffered build for large indexes.',
          },
        ],
      },
      {
        id: 'spgist',
        label: 'SP-GiST',
        description: 'Space-partitioned data: points, ranges, text prefixes.',
        unique: false,
        ordering: false,
        multiColumn: false,
        includeMinVersion: 140_000,
        storageParams: [FILLFACTOR],
      },
      {
        id: 'gin',
        label: 'GIN',
        description: 'Containment in arrays, jsonb and full-text documents.',
        unique: false,
        ordering: false,
        multiColumn: true,
        includeMinVersion: null,
        storageParams: [
          {
            name: 'fastupdate',
            kind: 'boolean',
            hint: 'Queue new entries for faster writes.',
          },
          {
            name: 'gin_pending_list_limit',
            kind: 'integer',
            min: 64,
            max: 2147483647,
            hint: 'Pending list size in kB.',
          },
        ],
      },
      {
        id: 'brin',
        label: 'BRIN',
        description: 'Tiny summaries for huge, naturally ordered tables.',
        unique: false,
        ordering: false,
        multiColumn: true,
        includeMinVersion: null,
        storageParams: [
          {
            name: 'pages_per_range',
            kind: 'integer',
            min: 1,
            max: 131072,
            hint: 'Table pages summarised per entry.',
          },
          { name: 'autosummarize', kind: 'boolean', hint: 'Summarise new pages automatically.' },
        ],
      },
    ],
    defaultMethod: 'btree',
    expressions: true,
    partial: true,
    concurrent: true,
    ifNotExists: true,
    tablespaces: true,
    opclasses: true,
    collations: true,
    nullsNotDistinctMinVersion: 150_000,
    maxNameBytes: 63,
  },
  routines: {
    kinds: ['function', 'procedure'],
    createOrReplace: true,
    parameterModes: ['in', 'out', 'inout', 'variadic'],
    returnsTable: true,
    volatilities: ['volatile', 'stable', 'immutable'],
    defaultVolatility: 'volatile',
    parallelModes: ['unsafe', 'restricted', 'safe'],
    strict: true,
    securityDefiner: true,
    leakproof: true,
    costAndRows: true,
    defaultLanguage: 'plpgsql',
    returnTypePresets: [
      'void',
      'trigger',
      'integer',
      'bigint',
      'numeric',
      'text',
      'boolean',
      'jsonb',
      'uuid',
      'timestamptz',
      'record',
    ],
  },
};

/** Whether `version` (server_version_num) meets `minVersion`. Unknown versions pass. */
export const MYSQL_OBJECTS: ObjectCapabilities = {
  indexes: {
    methods: [
      {
        id: 'btree',
        label: 'B-tree',
        description: 'Equality and range lookups. The default for InnoDB.',
        unique: true,
        ordering: true,
        multiColumn: true,
        includeMinVersion: null,
        storageParams: [],
      },
      {
        id: 'hash',
        label: 'Hash',
        description: 'Equality lookups. InnoDB uses a B-tree anyway.',
        unique: true,
        ordering: false,
        multiColumn: false,
        includeMinVersion: null,
        storageParams: [],
      },
      {
        id: 'fulltext',
        label: 'Fulltext',
        description: 'Word search in CHAR, VARCHAR and TEXT columns.',
        unique: false,
        ordering: false,
        multiColumn: true,
        includeMinVersion: null,
        storageParams: [],
      },
      {
        id: 'spatial',
        label: 'Spatial',
        description: 'A geometry column. The column must be NOT NULL.',
        unique: false,
        ordering: false,
        multiColumn: false,
        includeMinVersion: null,
        storageParams: [],
      },
    ],
    defaultMethod: 'btree',
    expressions: true,
    partial: false,
    concurrent: true,
    ifNotExists: false,
    tablespaces: false,
    opclasses: false,
    collations: false,
    nullsNotDistinctMinVersion: null,
    maxNameBytes: 64,
    onlineBuildLabel: 'ALGORITHM=INPLACE',
    onlineBuildHint: 'ALGORITHM=INPLACE, LOCK=NONE. MySQL may still copy the table.',
  },
  routines: {
    kinds: ['function', 'procedure'],
    createOrReplace: false,
    parameterModes: ['in', 'out', 'inout'],
    functionParameterModes: ['in'],
    returnsTable: false,
    volatilities: [],
    defaultVolatility: 'volatile',
    parallelModes: [],
    strict: false,
    securityDefiner: true,
    leakproof: false,
    costAndRows: false,
    deterministic: true,
    dataAccessModes: ['CONTAINS SQL', 'NO SQL', 'READS SQL DATA', 'MODIFIES SQL DATA'],
    defaultLanguage: 'SQL',
    returnTypePresets: ['INT', 'BIGINT', 'VARCHAR(255)', 'DECIMAL(10,2)', 'JSON', 'DATETIME'],
  },
};

export function versionAtLeast(version: number | undefined, minVersion: number | null | undefined) {
  if (minVersion === null) return false;
  if (minVersion === undefined || version === undefined || version <= 0) return true;
  return version >= minVersion;
}

export function indexMethod(caps: IndexCapabilities, id: string): IndexMethodSpec | undefined {
  return caps.methods.find((method) => method.id === id.toLowerCase());
}

export function methodSupportsInclude(method: IndexMethodSpec, version?: number): boolean {
  return versionAtLeast(version, method.includeMinVersion);
}

export function storageParamsFor(method: IndexMethodSpec, version?: number): StorageParamSpec[] {
  return method.storageParams.filter((param) => versionAtLeast(version, param.minVersion));
}
