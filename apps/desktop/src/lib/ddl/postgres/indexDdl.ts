import {
  DIALECTS,
  indexMethod,
  methodSupportsInclude,
  storageParamsFor,
  versionAtLeast,
  type StorageParamSpec,
} from '@db/database';
import type { IndexDefinition, TableSchema } from '../../../types';
import { qualifyTable } from '../../schemaChange';
import { emptyKeyDraft, type DdlPlan, type DdlResult, type IndexContext, type IndexDraft, type IndexKeyDraft } from '../types';

const { quoteIdent } = DIALECTS.PostgreSQL;
const caps = DIALECTS.PostgreSQL.objects.indexes;

const CONSTRAINT_LABEL = { primary: 'primary key', unique: 'unique', exclusion: 'exclusion' } as const;

export function emptyIndexDraft(_table: TableSchema): IndexDraft {
  return {
    name: '',
    method: caps.defaultMethod,
    unique: false,
    keys: [],
    include: [],
    predicate: '',
    nullsNotDistinct: false,
    storageParams: [],
    tablespace: '',
    concurrently: false,
    ifNotExists: false,
  };
}

export function indexDraftFrom(index: IndexDefinition): IndexDraft {
  const keys: IndexKeyDraft[] = index.keys?.length
    ? index.keys.map((key) => ({
        kind: key.isExpression ? 'expression' : 'column',
        value: key.expression,
        descending: key.descending,
        nulls: key.nullsFirst === undefined ? 'default' : key.nullsFirst ? 'first' : 'last',
        opclass: key.opclass ?? '',
        collation: key.collation ?? '',
      }))
    : index.columns.map((column) => emptyKeyDraft(column));
  return {
    name: index.name,
    method: index.type.toLowerCase(),
    unique: index.isUnique,
    keys,
    include: [...(index.includeColumns ?? [])],
    predicate: index.predicate ?? '',
    nullsNotDistinct: Boolean(index.nullsNotDistinct),
    storageParams: (index.storageParams ?? []).map((param) => ({ ...param })),
    tablespace: index.tablespace ?? '',
    concurrently: false,
    ifNotExists: false,
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function truncateBytes(value: string, max: number): string {
  let out = value;
  while (byteLength(out) > max) out = out.slice(0, -1);
  return out;
}

/** Index and table names in the table's schema, which share one namespace. */
function namesInSchema(ctx: IndexContext): Set<string> {
  const names = new Set<string>();
  for (const table of ctx.tables) {
    if (table.schema !== ctx.table.schema) continue;
    names.add(table.name);
    for (const index of table.indexes) names.add(index.name);
  }
  for (const index of ctx.table.indexes) names.add(index.name);
  names.add(ctx.table.name);
  return names;
}

/** PostgreSQL's own pattern: `table_col1_col2_idx` (`_key` when unique). */
export function suggestIndexName(draft: IndexDraft, ctx: IndexContext): string {
  const parts = draft.keys
    .filter((key) => key.value.trim())
    .map((key) => (key.kind === 'column' ? key.value.trim() : 'expr'));
  const suffix = draft.unique ? 'key' : 'idx';
  const stem = [ctx.table.name, ...parts].join('_');
  const taken = namesInSchema(ctx);
  for (let n = 0; ; n += 1) {
    const tail = `_${suffix}${n === 0 ? '' : n}`;
    const candidate = truncateBytes(stem, caps.maxNameBytes - byteLength(tail)) + tail;
    if (!taken.has(candidate)) return candidate;
  }
}

function checkStorageParam(
  param: { name: string; value: string },
  spec: StorageParamSpec | undefined,
  methodLabel: string
): string | null {
  if (!spec) return `${methodLabel} indexes have no storage parameter "${param.name}".`;
  const value = param.value.trim();
  if (spec.kind === 'integer') {
    const n = Number(value);
    const inRange =
      /^\d+$/.test(value) &&
      (spec.min === undefined || n >= spec.min) &&
      (spec.max === undefined || n <= spec.max);
    return inRange ? null : `${spec.name} must be a whole number from ${spec.min} to ${spec.max}.`;
  }
  if (spec.kind === 'boolean') {
    return /^(on|off|true|false)$/i.test(value) ? null : `${spec.name} must be on or off.`;
  }
  return spec.values?.includes(value.toLowerCase())
    ? null
    : `${spec.name} must be one of ${spec.values?.join(', ')}.`;
}

export function validateIndex(
  draft: IndexDraft,
  ctx: IndexContext,
  original?: IndexDefinition
): string[] {
  const errors: string[] = [];
  const version = ctx.serverVersionNum;
  const name = draft.name.trim();
  const tableLabel = `${ctx.table.schema}.${ctx.table.name}`;
  if (!name) errors.push('Index name is required.');
  else if (byteLength(name) > caps.maxNameBytes) {
    errors.push(`Index name is longer than ${caps.maxNameBytes} bytes.`);
  } else if (name !== original?.name && namesInSchema(ctx).has(name)) {
    errors.push(`An index or table named "${name}" already exists in ${ctx.table.schema}.`);
  }

  const keys = draft.keys;
  if (keys.length === 0) errors.push('Add at least one column or expression.');
  const columnNames = new Set(ctx.table.columns.map((column) => column.name));
  for (const key of keys) {
    if (!key.value.trim()) {
      errors.push(key.kind === 'column' ? 'Choose a column for every key.' : 'Expression keys cannot be empty.');
    } else if (key.kind === 'column' && !columnNames.has(key.value)) {
      errors.push(`Column "${key.value}" does not exist on ${tableLabel}.`);
    }
  }
  for (const column of draft.include) {
    if (!columnNames.has(column)) errors.push(`Column "${column}" does not exist on ${tableLabel}.`);
  }

  const method = indexMethod(caps, draft.method);
  if (!method) {
    errors.push(`Unknown index method "${draft.method}".`);
    return errors;
  }
  if (draft.unique && !method.unique) errors.push(`${method.label} indexes cannot be unique.`);
  if (!method.ordering && keys.some((key) => key.descending || key.nulls !== 'default')) {
    errors.push(`${method.label} indexes have no key ordering (ASC/DESC, NULLS).`);
  }
  if (!method.multiColumn && keys.length > 1) {
    errors.push(`${method.label} indexes cover a single key.`);
  }
  if (draft.include.length > 0 && !methodSupportsInclude(method, version)) {
    errors.push(`${method.label} indexes do not support INCLUDE columns on this server.`);
  }
  if (draft.nullsNotDistinct) {
    if (!draft.unique) errors.push('NULLS NOT DISTINCT only applies to unique indexes.');
    else if (!versionAtLeast(version, caps.nullsNotDistinctMinVersion)) {
      errors.push('NULLS NOT DISTINCT needs PostgreSQL 15 or later.');
    }
  }
  const specs = storageParamsFor(method, version);
  for (const param of draft.storageParams) {
    const error = checkStorageParam(
      param,
      specs.find((spec) => spec.name === param.name),
      method.label
    );
    if (error && !errors.includes(error)) errors.push(error);
  }
  return errors;
}

function keySql(key: IndexKeyDraft): string {
  const parts = [key.kind === 'column' ? quoteIdent(key.value) : `(${key.value.trim()})`];
  if (key.collation.trim()) parts.push(`COLLATE ${key.collation.trim()}`);
  if (key.opclass.trim()) parts.push(key.opclass.trim());
  if (key.descending) parts.push('DESC');
  if (key.nulls !== 'default') parts.push(`NULLS ${key.nulls.toUpperCase()}`);
  return parts.join(' ');
}

function createStatement(draft: IndexDraft, table: TableSchema, name: string, concurrently: boolean) {
  const head = [
    'CREATE',
    draft.unique ? 'UNIQUE INDEX' : 'INDEX',
    concurrently ? 'CONCURRENTLY' : '',
    draft.ifNotExists ? 'IF NOT EXISTS' : '',
    quoteIdent(name),
    'ON',
    qualifyTable(table.schema, table.name),
    `USING ${draft.method.toLowerCase()}`,
  ];
  let sql = `${head.filter(Boolean).join(' ')} (${draft.keys.map(keySql).join(', ')})`;
  if (draft.include.length > 0) sql += ` INCLUDE (${draft.include.map(quoteIdent).join(', ')})`;
  if (draft.unique && draft.nullsNotDistinct) sql += ' NULLS NOT DISTINCT';
  if (draft.storageParams.length > 0) {
    sql += ` WITH (${draft.storageParams.map((p) => `${p.name} = ${p.value.trim()}`).join(', ')})`;
  }
  if (draft.tablespace.trim()) sql += ` TABLESPACE ${quoteIdent(draft.tablespace.trim())}`;
  if (draft.predicate.trim()) sql += ` WHERE ${draft.predicate.trim()}`;
  return `${sql};`;
}

function refuse(reason: string): DdlResult {
  return { ok: false, reason };
}

function constraintRefusal(index: IndexDefinition): DdlResult | null {
  if (!index.constraint) return null;
  return refuse(
    `This index enforces the ${CONSTRAINT_LABEL[index.constraint.kind]} constraint "${index.constraint.name}". ` +
      'Change it with ALTER TABLE … DROP/ADD CONSTRAINT instead.'
  );
}

export function createIndex(draft: IndexDraft, ctx: IndexContext): DdlResult {
  const errors = validateIndex(draft, ctx);
  if (errors.length > 0) return refuse(errors[0]);
  const warnings = draft.concurrently
    ? ['CONCURRENTLY builds without blocking writes but takes longer, and runs outside a transaction. If it fails it leaves an INVALID index to drop.']
    : ['Building the index blocks writes to the table until it finishes. Use CONCURRENTLY on busy tables.'];
  return {
    ok: true,
    mode: 'create',
    statements: [createStatement(draft, ctx.table, draft.name.trim(), draft.concurrently)],
    transactional: !draft.concurrently,
    warnings,
  };
}

function sameKeys(left: IndexKeyDraft[], right: IndexKeyDraft[]): boolean {
  return (
    left.length === right.length &&
    left.every((key, i) => {
      const other = right[i];
      return (
        key.kind === other.kind &&
        key.value.trim() === other.value.trim() &&
        key.descending === other.descending &&
        key.nulls === other.nulls &&
        key.opclass.trim() === other.opclass.trim() &&
        key.collation.trim() === other.collation.trim()
      );
    })
  );
}

function isStructuralChange(before: IndexDraft, after: IndexDraft): boolean {
  return (
    before.method.toLowerCase() !== after.method.toLowerCase() ||
    before.unique !== after.unique ||
    !sameKeys(before.keys, after.keys) ||
    before.include.join('\u0000') !== after.include.join('\u0000') ||
    before.predicate.trim() !== after.predicate.trim() ||
    (after.unique && before.nullsNotDistinct !== after.nullsNotDistinct)
  );
}

/**
 * ALTER INDEX can rename, change storage parameters and move tablespaces.
 * Anything else means building a new index.
 */
export function planIndexChange(
  original: IndexDefinition,
  draft: IndexDraft,
  ctx: IndexContext
): DdlResult {
  const refusal = constraintRefusal(original);
  if (refusal) return refusal;
  const errors = validateIndex(draft, ctx, original);
  if (errors.length > 0) return refuse(errors[0]);

  const before = indexDraftFrom(original);
  const oldQualified = qualifyTable(ctx.table.schema, original.name);
  const newName = draft.name.trim();

  if (isStructuralChange(before, draft)) {
    if (!draft.concurrently) {
      return {
        ok: true,
        mode: 'recreate',
        statements: [
          `DROP INDEX ${oldQualified};`,
          createStatement({ ...draft, ifNotExists: false }, ctx.table, newName, false),
        ],
        transactional: true,
        warnings: [
          'PostgreSQL cannot alter an index this way, so it is dropped and rebuilt in one transaction. ' +
            'The rebuild blocks writes to the table until it finishes; use CONCURRENTLY on busy tables.',
        ],
      };
    }
    const renamed = newName !== original.name;
    const buildName = renamed
      ? newName
      : truncateBytes(newName, caps.maxNameBytes - 4) + '_new';
    const statements = [
      createStatement({ ...draft, ifNotExists: false }, ctx.table, buildName, true),
      `DROP INDEX CONCURRENTLY ${oldQualified};`,
    ];
    if (!renamed) {
      statements.push(
        `ALTER INDEX ${qualifyTable(ctx.table.schema, buildName)} RENAME TO ${quoteIdent(newName)};`
      );
    }
    return {
      ok: true,
      mode: 'recreate',
      statements,
      transactional: false,
      warnings: [
        `The replacement "${buildName}" is built concurrently, then the old index is dropped${renamed ? '' : ' and the replacement renamed'}. ` +
          'These steps run separately: if one fails, check for a leftover (possibly INVALID) ' +
          `"${buildName}" index and drop it.`,
      ],
    };
  }

  const statements: string[] = [];
  const oldParams = new Map(before.storageParams.map((p) => [p.name, p.value.trim()]));
  const newParams = new Map(draft.storageParams.map((p) => [p.name, p.value.trim()]));
  const set = [...newParams].filter(([name, value]) => oldParams.get(name) !== value);
  const reset = [...oldParams.keys()].filter((name) => !newParams.has(name));
  if (set.length > 0) {
    statements.push(
      `ALTER INDEX ${oldQualified} SET (${set.map(([name, value]) => `${name} = ${value}`).join(', ')});`
    );
  }
  if (reset.length > 0) statements.push(`ALTER INDEX ${oldQualified} RESET (${reset.join(', ')});`);
  if (before.tablespace.trim() !== draft.tablespace.trim()) {
    const target = draft.tablespace.trim() ? quoteIdent(draft.tablespace.trim()) : 'pg_default';
    statements.push(`ALTER INDEX ${oldQualified} SET TABLESPACE ${target};`);
  }
  if (newName !== original.name) {
    statements.push(`ALTER INDEX ${oldQualified} RENAME TO ${quoteIdent(newName)};`);
  }
  const warnings: string[] = [];
  if (statements.some((sql) => sql.includes('SET TABLESPACE'))) {
    warnings.push('Moving the index rewrites it and locks the table while it is copied.');
  }
  if (set.length > 0 || reset.length > 0) {
    warnings.push('Storage parameters apply to new pages; REINDEX to apply them to existing ones.');
  }
  const plan: DdlPlan = {
    ok: true,
    mode: statements.length === 0 ? 'none' : 'alter',
    statements,
    transactional: true,
    warnings,
  };
  return plan;
}

export function dropIndex(
  index: IndexDefinition,
  table: TableSchema,
  opts: { concurrently: boolean }
): DdlResult {
  const refusal = constraintRefusal(index);
  if (refusal) return refusal;
  const concurrently = opts.concurrently ? 'CONCURRENTLY ' : '';
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP INDEX ${concurrently}${qualifyTable(table.schema, index.name)};`],
    transactional: !opts.concurrently,
    warnings: [],
  };
}
