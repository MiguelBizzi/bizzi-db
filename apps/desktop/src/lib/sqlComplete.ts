import { DIALECTS } from '@db/database';
import { analyzeSql, type KeywordHint, type SqlContext, type TableRef } from './sqlContext';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

export interface SqlSchemaTable {
  schema: string;
  name: string;
  columns: { name: string }[];
}

export interface SqlCompletion {
  label: string;
  apply: string;
  type: 'keyword' | 'table' | 'column' | 'schema';
  detail?: string;
  boost?: number;
}

interface Candidate extends SqlCompletion {
  /** Unqualified name, used to tell when the user has already typed the whole thing. */
  name: string;
}

export function sqlCompletions(
  sql: string,
  cursor: number,
  tables: SqlSchemaTable[]
): SqlCompletion[] {
  const ctx = analyzeSql(sql, cursor);
  const needle = ctx.prefix.toLowerCase();
  switch (ctx.expects) {
    case 'table':
      return finish(tableCandidates(ctx, tables), ctx, ctx.parts.join('.').toLowerCase());
    case 'column':
      return finish(
        [...columnCandidates(ctx, tables), ...keywordCandidates(ctx)],
        ctx,
        needle
      );
    case 'insert-column':
      return finish(columnsOf(resolveRefs(ctx.refs, tables)), ctx, needle);
    case 'keyword':
      return finish(keywordCandidates(ctx), ctx, needle);
    default:
      return [];
  }
}

function tableCandidates(ctx: SqlContext, tables: SqlSchemaTable[]): Candidate[] {
  const schemaFilter = ctx.parts.length >= 2 ? ctx.parts[ctx.parts.length - 2].toLowerCase() : '';
  const all = allTables(tables);
  if (schemaFilter) return all.filter((item) => item.detail === 'table' && inSchema(item, schemaFilter));
  const schemas = [...new Set(tables.map((table) => table.schema).filter(Boolean))];
  return [
    ...schemas.map(
      (schema): Candidate => ({
        label: schema,
        name: schema,
        apply: quoteIdent(schema),
        type: 'schema',
        detail: 'schema',
        boost: 2,
      })
    ),
    ...all,
  ];
}

function allTables(tables: SqlSchemaTable[]): Candidate[] {
  return tables.map(
    (table): Candidate => ({
      label: table.schema ? `${table.schema}.${table.name}` : table.name,
      name: table.name,
      apply: table.schema
        ? `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`
        : quoteIdent(table.name),
      type: 'table',
      detail: 'table',
      boost: 5,
    })
  );
}

function inSchema(item: Candidate, schema: string): boolean {
  return item.label.toLowerCase().startsWith(`${schema}.`);
}

function columnCandidates(ctx: SqlContext, tables: SqlSchemaTable[]): Candidate[] {
  if (ctx.parts.length >= 2) {
    const qualifier = ctx.parts[ctx.parts.length - 2];
    const scoped = resolveQualifier(qualifier, ctx.scopeRefs, tables);
    if (scoped.length > 0) return columnsOf(scoped, ctx.qualifier);
    const schema = qualifier.toLowerCase();
    return allTables(tables).filter((item) => inSchema(item, schema));
  }
  const resolved = resolveRefs(ctx.refs, tables);
  if (resolved.length === 0) return columnsOf(tables);
  return columnsOf(resolved, '', resolved.length > 1 ? ctx.refs : undefined);
}

/**
 * Columns of the given tables. Pass `qualifierFor` refs to prefix names that
 * more than one of the tables has (`u.id`, `o.id`).
 */
function columnsOf(
  tables: SqlSchemaTable[],
  qualifier = '',
  qualifierFor?: TableRef[]
): Candidate[] {
  const counts = new Map<string, number>();
  if (qualifierFor) {
    for (const table of tables) {
      for (const column of table.columns) {
        counts.set(column.name, (counts.get(column.name) ?? 0) + 1);
      }
    }
  }
  return tables.flatMap((table) => {
    const owner = table.schema ? `${table.schema}.${table.name}` : table.name;
    const ref = qualifierFor?.find((r) => matchesTable(r, table));
    return table.columns.map((column): Candidate => {
      const ambiguous = !!ref && (counts.get(column.name) ?? 0) > 1;
      const alias = ref ? refQualifier(ref) : '';
      return {
        label: ambiguous ? `${ref.alias ?? ref.name}.${column.name}` : column.name,
        name: column.name,
        apply: ambiguous
          ? `${alias}.${quoteIdent(column.name)}`
          : `${qualifier}${quoteIdent(column.name)}`,
        type: 'column',
        detail: ref?.alias ? `${ref.alias} · ${owner}` : owner,
        boost: 10,
      };
    });
  });
}

function refQualifier(ref: TableRef): string {
  if (!ref.alias) return quoteIdent(ref.name);
  return ref.aliasQuoted ? quoteIdent(ref.alias) : ref.alias;
}

function matchesTable(ref: TableRef, table: SqlSchemaTable): boolean {
  return (
    ref.name.toLowerCase() === table.name.toLowerCase() &&
    (!ref.schema || ref.schema.toLowerCase() === table.schema.toLowerCase())
  );
}

function resolveRefs(refs: TableRef[], tables: SqlSchemaTable[]): SqlSchemaTable[] {
  const found: SqlSchemaTable[] = [];
  for (const ref of refs) {
    for (const table of tables) {
      if (matchesTable(ref, table) && !found.includes(table)) found.push(table);
    }
  }
  return found;
}

function resolveQualifier(
  qualifier: string,
  refs: TableRef[],
  tables: SqlSchemaTable[]
): SqlSchemaTable[] {
  const q = qualifier.toLowerCase();
  const byAlias = refs.filter((ref) => ref.alias?.toLowerCase() === q);
  const byName = refs.filter((ref) => ref.name.toLowerCase() === q);
  const hit = resolveRefs(byAlias.length > 0 ? byAlias : byName, tables);
  if (hit.length > 0) return hit;
  return tables.filter((table) => table.name.toLowerCase() === q);
}

function keywordCandidates(ctx: SqlContext): Candidate[] {
  if (ctx.inQuote || ctx.parts.length >= 2) return [];
  return ctx.keywords.map((hint: KeywordHint): Candidate => {
    const label = ctx.keywordUpper ? hint.label : hint.label.toLowerCase();
    return {
      label,
      name: label,
      apply: label,
      type: 'keyword',
      detail: hint.detail,
      boost: hint.boost,
    };
  });
}

/** 0 when the needle starts the name, 1 when it starts a later word, -1 otherwise. */
function matchTier(label: string, needle: string): number {
  if (!needle) return 0;
  const text = label.toLowerCase();
  if (text.startsWith(needle) || text.includes(`.${needle}`)) return 0;
  if (text.includes(`_${needle}`)) return 1;
  return -1;
}

function finish(items: Candidate[], ctx: SqlContext, typed: string): SqlCompletion[] {
  const needle = ctx.prefix.toLowerCase();
  const ranked: { item: Candidate; tier: number }[] = [];
  for (const item of items) {
    const tier = matchTier(item.label, needle);
    if (tier < 0) continue;
    const exact = item.type === 'table' || item.type === 'schema' ? item.label : item.name;
    if (typed && exact.toLowerCase() === typed) continue;
    ranked.push({ item, tier });
  }
  ranked.sort((a, b) => (b.item.boost ?? 0) - (a.item.boost ?? 0) || a.tier - b.tier);
  return ranked.map(({ item: { name: _name, ...item } }) => item);
}
