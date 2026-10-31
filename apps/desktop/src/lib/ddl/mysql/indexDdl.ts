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

const { quoteIdent, quoteLiteral } = DIALECTS.MySQL;
const qualify = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);
const caps = DIALECTS.MySQL.objects.indexes;

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
        kind: key.isExpression ? 'expression' : 'column',
        value: key.expression,
        descending: key.descending,
        nulls: 'default',
        opclass: '',
        collation: '',
      }))
    : index.columns.map((column) => emptyKeyDraft(column));
  return {
    ...emptyIndexDraft({} as TableSchema),
    name: index.name,
    method: index.type.toLowerCase(),
    unique: index.isUnique,
    keys,
    invisible: index.definition === 'INVISIBLE',
  };
}

export function suggestIndexName(draft: IndexDraft, ctx: IndexContext): string {
  const cols = draft.keys.map((key) => key.value.replace(/[^\w]+/g, '_')).filter(Boolean);
  const base = `${ctx.table.name}_${cols.join('_') || 'idx'}`.slice(0, caps.maxNameBytes);
  return base;
}

export function validateIndex(draft: IndexDraft, _ctx: IndexContext, _original?: IndexDefinition): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Name is required.');
  else if (new TextEncoder().encode(name).length > caps.maxNameBytes) {
    errors.push(`Name is longer than ${caps.maxNameBytes} bytes.`);
  }
  if (draft.keys.length === 0) errors.push('Add at least one key.');
  if (draft.keys.some((key) => !key.value.trim())) errors.push('Every key needs a column or expression.');
  const method = draft.method.toLowerCase();
  if ((method === 'fulltext' || method === 'spatial') && draft.unique) {
    errors.push(`${method.toUpperCase()} indexes cannot be unique.`);
  }
  return errors;
}

function keySql(key: IndexKeyDraft): string {
  if (key.kind === 'expression') {
    const expr = `(${key.value.trim()})`;
    return key.descending ? `${expr} DESC` : expr;
  }
  const prefix = key.value.trim().match(/^(.*?)\((\d+)\)$/);
  const column = prefix
    ? `${quoteIdent(prefix[1])}(${prefix[2]})`
    : quoteIdent(key.value.trim());
  return key.descending ? `${column} DESC` : column;
}

function kindWord(draft: IndexDraft): string {
  const method = draft.method.toLowerCase();
  if (method === 'fulltext') return 'FULLTEXT INDEX';
  if (method === 'spatial') return 'SPATIAL INDEX';
  return draft.unique ? 'UNIQUE INDEX' : 'INDEX';
}

function indexBody(draft: IndexDraft, name: string): string {
  const method = draft.method.toLowerCase();
  const using = method === 'btree' || method === 'hash' ? ` USING ${method.toUpperCase()}` : '';
  const invisible = draft.invisible ? ' INVISIBLE' : '';
  const comment = draft.comment?.trim() ? ` COMMENT ${quoteLiteral(draft.comment.trim())}` : '';
  return `${kindWord(draft)} ${quoteIdent(name)} (${draft.keys.map(keySql).join(', ')})${using}${invisible}${comment}`;
}

function createStatement(draft: IndexDraft, table: TableSchema, name: string): string {
  const method = draft.method.toLowerCase();
  const using = method === 'btree' || method === 'hash' ? ` USING ${method.toUpperCase()}` : '';
  const invisible = draft.invisible ? ' INVISIBLE' : '';
  const comment = draft.comment?.trim() ? ` COMMENT ${quoteLiteral(draft.comment.trim())}` : '';
  const online = draft.concurrently ? ' ALGORITHM=INPLACE, LOCK=NONE' : '';
  return `CREATE ${kindWord(draft)} ${quoteIdent(name)} ON ${qualify(table.schema, table.name)} (${draft.keys.map(keySql).join(', ')})${using}${invisible}${comment}${online};`;
}

function refuse(reason: string): DdlResult {
  return { ok: false, reason };
}

export function createIndex(draft: IndexDraft, ctx: IndexContext): DdlResult {
  const errors = validateIndex(draft, ctx);
  if (errors.length > 0) return refuse(errors[0]);
  return {
    ok: true,
    mode: 'create',
    statements: [createStatement(draft, ctx.table, draft.name.trim())],
    transactional: !draft.concurrently,
    warnings: draft.concurrently
      ? ['ALGORITHM=INPLACE, LOCK=NONE asks MySQL not to copy the table. It can still refuse and copy it.']
      : [],
  };
}

function structural(before: IndexDraft, after: IndexDraft): boolean {
  return (
    before.method.toLowerCase() !== after.method.toLowerCase() ||
    before.unique !== after.unique ||
    before.keys.length !== after.keys.length ||
    before.keys.some((key, i) => key.value !== after.keys[i].value || key.descending !== after.keys[i].descending || key.kind !== after.keys[i].kind) ||
    (before.comment ?? '') !== (after.comment ?? '')
  );
}

export function planIndexChange(original: IndexDefinition, draft: IndexDraft, ctx: IndexContext): DdlResult {
  const errors = validateIndex(draft, ctx, original);
  if (errors.length > 0) return refuse(errors[0]);
  const before = indexDraftFrom(original);
  const table = qualify(ctx.table.schema, ctx.table.name);
  const newName = draft.name.trim();
  if (original.isPrimary && structural(before, draft)) {
    return {
      ok: true,
      mode: 'recreate',
      statements: [`ALTER TABLE ${table} DROP PRIMARY KEY, ADD PRIMARY KEY (${draft.keys.map(keySql).join(', ')});`],
      transactional: false,
      warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
    };
  }
  if (!structural(before, draft)) {
    const statements: string[] = [];
    if (newName !== original.name) {
      statements.push(`ALTER TABLE ${table} RENAME INDEX ${quoteIdent(original.name)} TO ${quoteIdent(newName)};`);
    }
    if (Boolean(before.invisible) !== Boolean(draft.invisible)) {
      statements.push(
        `ALTER TABLE ${table} ALTER INDEX ${quoteIdent(newName)} ${draft.invisible ? 'INVISIBLE' : 'VISIBLE'};`,
      );
    }
    if (statements.length === 0) {
      return { ok: true, mode: 'none', statements: [], transactional: true, warnings: [] };
    }
    return {
      ok: true,
      mode: 'alter',
      statements,
      transactional: false,
      warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
    };
  }
  return {
    ok: true,
    mode: 'recreate',
    statements: [`ALTER TABLE ${table} DROP INDEX ${quoteIdent(original.name)}, ADD ${indexBody(draft, newName)};`],
    transactional: false,
    warnings: ['The index is dropped and added in one ALTER TABLE. MySQL still commits DDL immediately.'],
  };
}

export function dropIndex(index: IndexDefinition, table: TableSchema, _opts: { concurrently: boolean }): DdlResult {
  const qualified = qualify(table.schema, table.name);
  const sql = index.isPrimary
    ? `ALTER TABLE ${qualified} DROP PRIMARY KEY;`
    : `DROP INDEX ${quoteIdent(index.name)} ON ${qualified};`;
  return {
    ok: true,
    mode: 'drop',
    statements: [sql],
    transactional: false,
    warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
  };
}
