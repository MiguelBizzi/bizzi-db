import { DIALECTS } from '@db/database';
import type { IndexDefinition, TableSchema } from '../../../types';
import { qualifyTable as qualifyQuoted } from '../../schemaChange';
import {
  emptyKeyDraft,
  type DdlResult,
  type IndexContext,
  type IndexDraft,
  type IndexKeyDraft,
} from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.SQLServer;
const qualify = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);
const caps = DIALECTS.SQLServer.objects.indexes;

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
    invisible: false,
    comment: '',
  };
}

export function indexDraftFrom(index: IndexDefinition): IndexDraft {
  const keys: IndexKeyDraft[] = index.keys?.length
    ? index.keys.map((key) => ({
        ...emptyKeyDraft(key.expression),
        kind: key.isExpression ? 'expression' : 'column',
        descending: key.descending,
      }))
    : index.columns.map((column) => emptyKeyDraft(column));
  return {
    ...emptyIndexDraft({} as TableSchema),
    name: index.name,
    method: index.type.toLowerCase() || caps.defaultMethod,
    unique: index.isUnique,
    keys,
    include: index.includeColumns ?? [],
    predicate: index.predicate ?? '',
    storageParams: (index.storageParams ?? []).map((param) => ({ name: param.name, value: param.value })),
  };
}

export function suggestIndexName(draft: IndexDraft, ctx: IndexContext): string {
  const cols = draft.keys.map((key) => key.value.replace(/[^\w]+/g, '_')).filter(Boolean);
  return `${ctx.table.name}_${cols.join('_') || 'idx'}`.slice(0, caps.maxNameBytes);
}

export function validateIndex(draft: IndexDraft, _ctx: IndexContext, _original?: IndexDefinition): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Name is required.');
  else if (new TextEncoder().encode(name).length > caps.maxNameBytes) {
    errors.push(`Name is longer than ${caps.maxNameBytes} bytes.`);
  }
  const method = draft.method.toLowerCase();
  const columnstore = method.includes('columnstore');
  if (!columnstore && draft.keys.length === 0) errors.push('Add at least one key.');
  if (draft.keys.some((key) => !key.value.trim())) errors.push('Every key needs a column.');
  if (draft.keys.some((key) => key.kind === 'expression')) {
    errors.push('SQL Server indexes in this app are on columns.');
  }
  if (columnstore && draft.unique) errors.push('A columnstore index cannot be unique.');
  return errors;
}

function keySql(key: IndexKeyDraft): string {
  const column = quoteIdent(key.value.trim());
  return key.descending ? `${column} DESC` : column;
}

function withOptions(draft: IndexDraft): string {
  const parts: string[] = [];
  for (const param of draft.storageParams) {
    const value = param.value.trim();
    if (!value) continue;
    const name = param.name.toUpperCase();
    if (param.name === 'pad_index' || param.name === 'ignore_dup_key') {
      const on = value === '1' || value.toLowerCase() === 'on' || value.toLowerCase() === 'true';
      parts.push(`${name} = ${on ? 'ON' : 'OFF'}`);
    } else if (param.name === 'data_compression') {
      parts.push(`DATA_COMPRESSION = ${value.toUpperCase()}`);
    } else {
      parts.push(`${name} = ${value}`);
    }
  }
  if (draft.concurrently && !draft.method.toLowerCase().includes('columnstore')) {
    parts.push('ONLINE = ON');
  }
  return parts.length > 0 ? ` WITH (${parts.join(', ')})` : '';
}

export function buildCreateIndexSql(table: TableSchema, draft: IndexDraft): string {
  const method = draft.method.toLowerCase();
  const columnstore = method.includes('columnstore');
  const unique = draft.unique && !columnstore ? 'UNIQUE ' : '';
  const head = `CREATE ${unique}${method.toUpperCase()} INDEX ${quoteIdent(draft.name.trim())} ON ${qualify(table.schema, table.name)}`;
  if (columnstore && draft.keys.length === 0) return `${head};`;
  const keys = draft.keys.map(keySql).join(', ');
  const include = draft.include.filter((name) => name.trim()).length
    ? ` INCLUDE (${draft.include.filter((name) => name.trim()).map((name) => quoteIdent(name.trim())).join(', ')})`
    : '';
  const where = draft.predicate.trim() ? ` WHERE ${draft.predicate.trim()}` : '';
  return `${head} (${keys})${include}${where}${withOptions(draft)};`;
}

const ONLINE_WARNING =
  'WITH (ONLINE = ON) needs Enterprise, Developer, or Azure SQL. It cannot run inside a transaction.';

export function planCreateIndex(table: TableSchema, draft: IndexDraft): DdlResult {
  return createIndex(draft, { table, tables: [table] });
}

export function createIndex(draft: IndexDraft, ctx: IndexContext): DdlResult {
  const errors = validateIndex(draft, ctx);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  return {
    ok: true,
    mode: 'create',
    statements: [buildCreateIndexSql(ctx.table, draft)],
    transactional: !draft.concurrently,
    warnings: draft.concurrently ? [ONLINE_WARNING] : [],
  };
}

export function planIndexChange(original: IndexDefinition, draft: IndexDraft, ctx: IndexContext): DdlResult {
  const errors = validateIndex(draft, ctx, original);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const statements: string[] = [];
  if (draft.name.trim() !== original.name) {
    const old = `${quoteIdent(ctx.table.schema)}.${quoteIdent(ctx.table.name)}.${quoteIdent(original.name)}`;
    statements.push(`EXEC sp_rename ${quoteLiteral(old)}, ${quoteLiteral(draft.name.trim())}, N'INDEX';`);
  }
  const before = indexDraftFrom(original);
  const sameShape =
    before.method === draft.method.toLowerCase() &&
    before.unique === draft.unique &&
    before.predicate === draft.predicate &&
    before.keys.length === draft.keys.length &&
    before.keys.every((key, i) => key.value === draft.keys[i].value && key.descending === draft.keys[i].descending);
  if (!sameShape) {
    statements.push(dropSql(original, ctx.table));
    statements.push(buildCreateIndexSql(ctx.table, { ...draft, concurrently: false }));
  }
  if (statements.length === 0) {
    return { ok: true, mode: 'none', statements: [], transactional: true, warnings: [] };
  }
  return {
    ok: true,
    mode: sameShape ? 'alter' : 'recreate',
    statements,
    transactional: !draft.concurrently,
    warnings: draft.concurrently ? [ONLINE_WARNING] : [],
  };
}

function dropSql(index: IndexDefinition, table: TableSchema): string {
  const qualified = qualify(table.schema, table.name);
  if (index.isPrimary || index.constraint) {
    return `ALTER TABLE ${qualified} DROP CONSTRAINT ${quoteIdent(index.constraint?.name || index.name)};`;
  }
  return `DROP INDEX ${quoteIdent(index.name)} ON ${qualified};`;
}

export function dropIndex(index: IndexDefinition, table: TableSchema, opts: { concurrently: boolean }): DdlResult {
  return {
    ok: true,
    mode: 'drop',
    statements: [dropSql(index, table)],
    transactional: !opts.concurrently,
    warnings: opts.concurrently ? [ONLINE_WARNING] : [],
  };
}
