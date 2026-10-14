import type { ColumnDefinition, QueryExecutionResult, TableSchema } from '../types';
import { inferQualifiedTable } from './dataExport';
import { resultTotalRows } from './queryPaging';

export interface QueryResultAnalysis {
  /** Table the grid renders: the source table when editable, a read-only stand-in otherwise. */
  table: TableSchema;
  /** Real schema table the rows come from; set only when edits can be written back. */
  sourceTable?: TableSchema;
  editable: boolean;
  readOnlyReason?: string;
  /** Result columns that are not plain source columns (aliases, expressions). */
  readOnlyColumns: Set<string>;
}

type ResultShape = Pick<
  QueryExecutionResult,
  'query' | 'columns' | 'rows' | 'pageOffset' | 'totalRows'
>;

const IDENT = String.raw`"[^"]+"|[A-Za-z_][\w$]*`;
const CLAUSE_START = String.raw`where|order|limit|offset|fetch|for`;
const FROM_TARGET = new RegExp(
  String.raw`\bfrom\s+(${IDENT})(?:\s*\.\s*(${IDENT}))?` +
    String.raw`(?:\s+(?:as\s+)?(?!(?:${CLAUSE_START})\b)(?:${IDENT}))?` +
    String.raw`\s*(?:\b(?:${CLAUSE_START})\b|$)`,
  'i'
);
const UNSUPPORTED_CLAUSE =
  /\b(join|union|intersect|except|group\s+by|distinct|having|over|into|lateral)\b/i;
const AGGREGATE =
  /\b(count|sum|avg|min|max|array_agg|string_agg|json_agg|jsonb_agg|bool_and|bool_or)\s*\(/i;

/** Drops comments and string literals so keyword scans only see real SQL. */
function scrub(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .trim()
    .replace(/;+\s*$/, '');
}

function unquote(ident: string): { name: string; quoted: boolean } {
  return ident.startsWith('"')
    ? { name: ident.slice(1, -1), quoted: true }
    : { name: ident, quoted: false };
}

function namesMatch(candidate: string, ref: { name: string; quoted: boolean }): boolean {
  return ref.quoted ? candidate === ref.name : candidate.toLowerCase() === ref.name.toLowerCase();
}

function structureProblem(scrubbed: string): string | null {
  if (!/^select\b/i.test(scrubbed)) return 'Only plain SELECT queries can be edited.';
  const withoutQuotedIdents = scrubbed.replace(/"[^"]*"/g, '""');
  if (UNSUPPORTED_CLAUSE.test(withoutQuotedIdents) || AGGREGATE.test(withoutQuotedIdents)) {
    return 'Joins, aggregates, DISTINCT and similar clauses mix rows, so this result is read-only.';
  }
  if (/\(\s*select\b/i.test(withoutQuotedIdents)) {
    return 'Queries with subqueries are read-only.';
  }
  if ((withoutQuotedIdents.match(/\bfrom\b/gi) ?? []).length !== 1) {
    return 'Only queries reading from a single table can be edited.';
  }
  return null;
}

function parseFromTarget(scrubbed: string): {
  schema?: { name: string; quoted: boolean };
  table: { name: string; quoted: boolean };
} | null {
  const match = scrubbed.match(FROM_TARGET);
  if (!match) return null;
  const first = unquote(match[1]);
  if (!match[2]) return { table: first };
  return { schema: first, table: unquote(match[2]) };
}

function resolveTable(
  target: NonNullable<ReturnType<typeof parseFromTarget>>,
  tables: TableSchema[]
): TableSchema | 'ambiguous' | undefined {
  const matches = tables.filter(
    (candidate) =>
      namesMatch(candidate.name, target.table) &&
      (!target.schema || namesMatch(candidate.schema, target.schema))
  );
  if (matches.length <= 1) return matches[0];
  const inPublic = matches.filter((candidate) => candidate.schema === 'public');
  return inPublic.length === 1 ? inPublic[0] : 'ambiguous';
}

function resultColumnNames(result: ResultShape): string[] {
  if (result.columns) return result.columns;
  const first = result.rows?.[0];
  return first ? Object.keys(first) : [];
}

function editabilityProblem(
  source: TableSchema | 'ambiguous' | undefined,
  columns: string[]
): string | null {
  if (source === 'ambiguous') return 'Several tables share this name; qualify it with a schema to edit.';
  if (!source) return 'The source table was not found in the loaded schema.';
  if (source.isView) return 'Views cannot be edited.';
  if (new Set(columns).size !== columns.length) return 'Duplicate column names make rows ambiguous.';
  const keys = source.columns.filter((column) => column.isPrimary);
  if (keys.length === 0) return 'The table has no primary key, so rows cannot be identified.';
  if (keys.length > 1) return 'Tables with a composite primary key cannot be edited yet.';
  if (!columns.includes(keys[0].name)) {
    return `Select the primary key column (${keys[0].name}) to edit rows.`;
  }
  return null;
}

export function analyzeQueryResult(
  result: ResultShape,
  tables: TableSchema[]
): QueryResultAnalysis {
  const columns = resultColumnNames(result);
  const rowCount = resultTotalRows(result);
  const scrubbed = scrub(result.query);

  const structure = structureProblem(scrubbed);
  const target = structure ? null : parseFromTarget(scrubbed);
  const resolved = target ? resolveTable(target, tables) : undefined;
  const problem =
    structure ??
    (target ? editabilityProblem(resolved, columns) : 'Only queries reading from a single table can be edited.');

  const mappedFrom = typeof resolved === 'object' ? resolved : undefined;
  const readOnlyColumns = new Set<string>();
  const mappedColumns: ColumnDefinition[] = columns.map((name) => {
    const known = mappedFrom?.columns.find((column) => column.name === name);
    if (known) return known;
    readOnlyColumns.add(name);
    return { name, type: 'unknown', isNullable: true };
  });

  if (!problem && mappedFrom) {
    return {
      table: { ...mappedFrom, columns: mappedColumns, rowCount },
      sourceTable: mappedFrom,
      editable: true,
      readOnlyColumns,
    };
  }

  const { schema, table: name } = inferQualifiedTable(result.query);
  return {
    table: {
      id: `query:${schema}.${name}`,
      name,
      schema,
      rowCount,
      sizeMb: 0,
      tags: [],
      columns: mappedColumns,
      indexes: [],
      createdAt: '',
      updatedAt: '',
      isView: true,
    },
    editable: false,
    readOnlyReason: problem ?? undefined,
    readOnlyColumns,
  };
}
