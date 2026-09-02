import { DIALECTS } from '@db/database';
import type { ColumnDefinition, FilterClause } from '../types';
import { enumValuesFor } from './insertRow';
import { filterNeedsValue } from './tableFilters';

const quoteIdent = DIALECTS.PostgreSQL.quoteIdent;

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'ILIKE',
  'IN',
  'IS',
  'NULL',
  'BETWEEN',
  'ORDER',
  'BY',
  'SELECT',
  'FROM',
  'WHERE',
  'TRUE',
  'FALSE',
]);

const COMPLETE_KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'ILIKE',
  'IN',
  'IS',
  'NULL',
  'BETWEEN',
]);

const COMPARE_OPS = new Set(['=', '!=', '<>', '>', '<', '>=', '<=']);
const VALUE_HINT_CAP = 20;

const OPERATOR_COMPLETIONS: { label: string; apply: string }[] = [
  { label: '=', apply: '= ' },
  { label: '!=', apply: '!= ' },
  { label: '>', apply: '> ' },
  { label: '<', apply: '< ' },
  { label: '>=', apply: '>= ' },
  { label: '<=', apply: '<= ' },
  { label: 'LIKE', apply: 'LIKE ' },
  { label: 'ILIKE', apply: 'ILIKE ' },
  { label: 'IN', apply: 'IN (' },
  { label: 'IS NULL', apply: 'IS NULL ' },
  { label: 'IS NOT NULL', apply: 'IS NOT NULL ' },
];

type TokenKind =
  | 'ident'
  | 'string'
  | 'number'
  | 'op'
  | 'keyword'
  | 'lparen'
  | 'rparen'
  | 'comma';

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

export interface ParsedFilterClause {
  column: string;
  operator: FilterClause['operator'];
  value: string;
}

export type FilterParseResult =
  | { status: 'ok'; clauses: ParsedFilterClause[] }
  | { status: 'incomplete' }
  | { status: 'error'; message: string };

export type FilterCommitResult =
  | { kind: 'commit'; filters: FilterClause[] }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; message: string };

export type FilterCompletionType = 'column' | 'operator' | 'value' | 'keyword';

export interface FilterCompletion {
  label: string;
  apply: string;
  type: FilterCompletionType;
  from: number;
  to: number;
}

type ExpectKind =
  | 'column'
  | 'operator'
  | 'is-tail'
  | 'value'
  | 'in-open'
  | 'in-value'
  | 'in-sep'
  | 'and';

export function parseFilterExpression(text: string, columns: string[]): FilterParseResult {
  const tokens = tokenize(text);
  if (!tokens) return { status: 'error', message: 'Invalid expression' };
  if (tokens.length === 0) return { status: 'incomplete' };

  const parser = new Parser(tokens, columns, text);
  return parser.parse();
}

export function serializeFilterExpression(filters: FilterClause[]): string {
  return filters
    .filter((filter) => filter.enabled && isCompleteClause(filter))
    .map(formatClause)
    .join(' AND ');
}

export function appendParsedFilters(
  parsed: ParsedFilterClause[],
  existing: FilterClause[],
  nextId?: (index: number) => string
): FilterClause[] {
  const kept = existing.filter((filter) => !filter.enabled || isCompleteClause(filter));
  const added = parsed.map((clause, index) => ({
    id: nextId?.(index) ?? `f_expr_${index}`,
    column: clause.column,
    operator: clause.operator,
    value: clause.value,
    enabled: true,
  }));
  return [...kept, ...added];
}

export function commitFilterExpression(
  text: string,
  existing: FilterClause[],
  columns: string[],
  options?: { nextId?: (index: number) => string }
): FilterCommitResult {
  const parsed = parseFilterExpression(text, columns);
  if (parsed.status === 'incomplete') return { kind: 'incomplete' };
  if (parsed.status === 'error') return { kind: 'invalid', message: parsed.message };
  return {
    kind: 'commit',
    filters: appendParsedFilters(parsed.clauses, existing, options?.nextId),
  };
}

export function shouldSubmitFilterExpression(
  text: string,
  cursor: number,
  columns: string[]
): boolean {
  if (cursor !== text.length) return false;
  return parseFilterExpression(text, columns).status === 'ok';
}

export function filterExpressionCompletions(
  text: string,
  cursor: number,
  columns: ColumnDefinition[],
  valueHints: Record<string, string[]> = {}
): FilterCompletion[] {
  const at = Math.max(0, Math.min(cursor, text.length));
  const prefix = text.slice(0, at);
  const tokens = tokenize(prefix);
  if (!tokens) return [];
  const names = columns.map((column) => column.name);
  const { needle, from, to, expect, column } = completionState(prefix, tokens, names);
  const items = suggestionsFor(expect, columns, valueHints, column);
  return items.filter((item) => matchesNeedle(item, needle)).map((item) => ({ ...item, from, to }));
}

export function applyFilterCompletion(
  text: string,
  cursor: number,
  item: FilterCompletion
): { text: string; cursor: number } {
  const next = text.slice(0, item.from) + item.apply + text.slice(Math.max(cursor, item.to));
  return { text: next, cursor: item.from + item.apply.length };
}

export function valueHintsFromRows(
  columns: ColumnDefinition[],
  rows: Record<string, unknown>[],
  cap = VALUE_HINT_CAP
): Record<string, string[]> {
  const hints: Record<string, string[]> = {};
  for (const column of columns) {
    const enums = enumValuesFor(column);
    if (enums.length > 0) {
      hints[column.name] = enums.slice(0, cap);
      continue;
    }
    const seen = new Set<string>();
    const values: string[] = [];
    for (const row of rows) {
      const raw = row[column.name];
      if (raw === null || raw === undefined) continue;
      const text = String(raw);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      values.push(text);
      if (values.length >= cap) break;
    }
    if (values.length > 0) hints[column.name] = values;
  }
  return hints;
}

function isCompleteClause(filter: FilterClause): boolean {
  if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') return true;
  return filterNeedsValue(filter.operator) && Boolean(filter.value);
}

function formatClause(filter: FilterClause): string {
  const column = formatColumn(filter.column);
  if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
    return `${column} ${filter.operator}`;
  }
  if (filter.operator === 'IN') {
    const parts = filter.value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => formatValue('=', part));
    return `${column} IN (${parts.join(', ')})`;
  }
  return `${column} ${filter.operator} ${formatValue(filter.operator, filter.value)}`;
}

function formatColumn(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || KEYWORDS.has(name.toUpperCase())) {
    return quoteIdent(name);
  }
  return name;
}

function formatValue(operator: FilterClause['operator'], value: string): string {
  if ((operator === '>' || operator === '<' || operator === '>=' || operator === '<=') && isNumericLiteral(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (c === '"') {
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        value += text[i];
        i += 1;
      }
      if (!closed) return null;
      tokens.push({ kind: 'ident', value, start, end: i });
      continue;
    }
    if (c === "'") {
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        value += text[i];
        i += 1;
      }
      if (!closed) return null;
      tokens.push({ kind: 'string', value, start, end: i });
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', value: '(', start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', value: ')', start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', value: ',', start: i, end: i + 1 });
      i += 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '<>' || two === '!=') {
      tokens.push({ kind: 'op', value: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === '=' || c === '>' || c === '<') {
      tokens.push({ kind: 'op', value: c, start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (c === '-' && /[0-9]/.test(text[i + 1] ?? '')) {
      const start = i;
      i += 1;
      while (i < text.length && /[0-9.]/.test(text[i])) i += 1;
      tokens.push({ kind: 'number', value: text.slice(start, i), start, end: i });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < text.length && /[0-9.]/.test(text[i])) i += 1;
      tokens.push({ kind: 'number', value: text.slice(start, i), start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      i += 1;
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i += 1;
      const raw = text.slice(start, i);
      const upper = raw.toUpperCase();
      if (KEYWORDS.has(upper) && COMPLETE_KEYWORDS.has(upper)) {
        tokens.push({ kind: 'keyword', value: upper, start, end: i });
      } else {
        tokens.push({ kind: 'ident', value: raw, start, end: i });
      }
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly columns: string[],
    private readonly source: string
  ) {}

  parse(): FilterParseResult {
    const first = this.peek();
    if (first?.kind === 'keyword' && first.value === 'NOT') {
      return { status: 'error', message: 'NOT is not supported' };
    }
    if (first?.kind === 'lparen') {
      return { status: 'error', message: 'Parentheses are not supported' };
    }

    const clauses: ParsedFilterClause[] = [];
    const firstClause = this.parseClause();
    if (firstClause.status !== 'ok') return firstClause;
    clauses.push(firstClause.clause);

    while (this.peek()) {
      const token = this.peek()!;
      if (token.kind === 'keyword' && token.value === 'AND') {
        this.index += 1;
        if (!this.peek()) return { status: 'incomplete' };
        const next = this.parseClause();
        if (next.status !== 'ok') return next;
        clauses.push(next.clause);
        continue;
      }
      if (token.kind === 'keyword' && token.value === 'OR') {
        return { status: 'error', message: 'OR is not supported; combine conditions with AND' };
      }
      return { status: 'error', message: `Unexpected token '${this.tokenText(token)}'` };
    }

    return { status: 'ok', clauses };
  }

  private parseClause():
    | { status: 'ok'; clause: ParsedFilterClause }
    | { status: 'incomplete' }
    | { status: 'error'; message: string } {
    const columnTok = this.peek();
    if (!columnTok) return { status: 'incomplete' };
    if (columnTok.kind !== 'ident') {
      if (columnTok.kind === 'keyword' && columnTok.value === 'NOT') {
        return { status: 'error', message: 'NOT is not supported' };
      }
      if (columnTok.kind === 'keyword' && columnTok.value === 'BETWEEN') {
        return { status: 'error', message: 'BETWEEN is not supported' };
      }
      return { status: 'error', message: `Unexpected token '${this.tokenText(columnTok)}'` };
    }

    const resolved = resolveColumn(columnTok.value, this.columns);
    const restAfterColumn = this.tokens[this.index + 1];
    if (!resolved) {
      if (!restAfterColumn && couldBeColumnPrefix(columnTok.value, this.columns)) {
        return { status: 'incomplete' };
      }
      return {
        status: 'error',
        message: `Invalid expression: '${columnTok.value}' is not a valid column`,
      };
    }
    this.index += 1;

    const opTok = this.peek();
    if (!opTok) return { status: 'incomplete' };

    if (opTok.kind === 'keyword' && opTok.value === 'BETWEEN') {
      return { status: 'error', message: 'BETWEEN is not supported' };
    }

    if (opTok.kind === 'keyword' && opTok.value === 'IS') {
      this.index += 1;
      const afterIs = this.peek();
      if (!afterIs) return { status: 'incomplete' };
      if (afterIs.kind === 'keyword' && afterIs.value === 'NULL') {
        this.index += 1;
        return { status: 'ok', clause: { column: resolved, operator: 'IS NULL', value: '' } };
      }
      if (afterIs.kind === 'keyword' && afterIs.value === 'NOT') {
        this.index += 1;
        const afterNot = this.peek();
        if (!afterNot) return { status: 'incomplete' };
        if (afterNot.kind === 'keyword' && afterNot.value === 'NULL') {
          this.index += 1;
          return {
            status: 'ok',
            clause: { column: resolved, operator: 'IS NOT NULL', value: '' },
          };
        }
        return { status: 'error', message: 'NOT is not supported' };
      }
      return { status: 'incomplete' };
    }

    if (opTok.kind === 'keyword' && opTok.value === 'IN') {
      this.index += 1;
      return this.parseInList(resolved);
    }

    if (opTok.kind === 'keyword' && (opTok.value === 'LIKE' || opTok.value === 'ILIKE')) {
      this.index += 1;
      const value = this.parseValue();
      if (value.status !== 'ok') return value;
      return {
        status: 'ok',
        clause: { column: resolved, operator: opTok.value, value: value.value },
      };
    }

    if (opTok.kind === 'op' && COMPARE_OPS.has(opTok.value)) {
      this.index += 1;
      const value = this.parseValue();
      if (value.status !== 'ok') return value;
      const operator: FilterClause['operator'] = opTok.value === '<>' ? '!=' : opTok.value as FilterClause['operator'];
      return { status: 'ok', clause: { column: resolved, operator, value: value.value } };
    }

    if (opTok.kind === 'keyword' && opTok.value === 'AND') return { status: 'incomplete' };
    return { status: 'error', message: `Unexpected token '${this.tokenText(opTok)}'` };
  }

  private parseInList(
    column: string
  ):
    | { status: 'ok'; clause: ParsedFilterClause }
    | { status: 'incomplete' }
    | { status: 'error'; message: string } {
    const open = this.peek();
    if (!open) return { status: 'incomplete' };
    if (open.kind !== 'lparen') {
      return { status: 'error', message: `Unexpected token '${this.tokenText(open)}'` };
    }
    this.index += 1;
    const values: string[] = [];
    if (this.peek()?.kind === 'rparen') return { status: 'incomplete' };
    while (true) {
      const value = this.parseValue();
      if (value.status !== 'ok') return value;
      values.push(value.value);
      const sep = this.peek();
      if (!sep) return { status: 'incomplete' };
      if (sep.kind === 'comma') {
        this.index += 1;
        if (!this.peek()) return { status: 'incomplete' };
        continue;
      }
      if (sep.kind === 'rparen') {
        this.index += 1;
        return { status: 'ok', clause: { column, operator: 'IN', value: values.join(', ') } };
      }
      return { status: 'error', message: `Unexpected token '${this.tokenText(sep)}'` };
    }
  }

  private parseValue():
    | { status: 'ok'; value: string }
    | { status: 'incomplete' }
    | { status: 'error'; message: string } {
    const token = this.peek();
    if (!token) return { status: 'incomplete' };
    if (token.kind === 'string' || token.kind === 'number' || token.kind === 'ident') {
      this.index += 1;
      return { status: 'ok', value: token.value };
    }
    if (token.kind === 'keyword' && (token.value === 'TRUE' || token.value === 'FALSE' || token.value === 'NULL')) {
      this.index += 1;
      return { status: 'ok', value: token.value.toLowerCase() };
    }
    return { status: 'error', message: `Unexpected token '${this.tokenText(token)}'` };
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private tokenText(token: Token): string {
    return this.source.slice(token.start, token.end) || token.value;
  }
}

function resolveColumn(name: string, columns: string[]): string | null {
  const exact = columns.find((column) => column === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  const matches = columns.filter((column) => column.toLowerCase() === lower);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function couldBeColumnPrefix(name: string, columns: string[]): boolean {
  const lower = name.toLowerCase();
  return columns.some((column) => column.toLowerCase().startsWith(lower));
}

function completionState(
  prefix: string,
  tokens: Token[],
  columns: string[]
): {
  completed: Token[];
  needle: string;
  from: number;
  to: number;
  expect: ExpectKind;
  column?: string;
} {
  const endsWithSpace = prefix.length > 0 && /\s$/.test(prefix);
  let completed = tokens;
  let needle = '';
  let from = prefix.length;
  let to = prefix.length;

  if (!endsWithSpace && tokens.length > 0) {
    const last = tokens[tokens.length - 1]!;
    const partial = last.end === prefix.length && last.kind === 'ident';
    if (partial) {
      completed = tokens.slice(0, -1);
      needle = prefix.slice(last.start);
      from = last.start;
      to = last.end;
    }
  }

  const walked = walkExpect(completed, columns);
  return { completed, needle, from, to, ...walked };
}

function walkExpect(
  tokens: Token[],
  columns: string[]
): { expect: ExpectKind; column?: string } {
  let expect: ExpectKind = 'column';
  let column: string | undefined;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (expect === 'column') {
      if (token.kind === 'ident') {
        column = resolveColumn(token.value, columns) ?? token.value;
        expect = 'operator';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'operator') {
      if (token.kind === 'keyword' && token.value === 'IS') {
        expect = 'is-tail';
        i += 1;
        continue;
      }
      if (token.kind === 'keyword' && token.value === 'IN') {
        expect = 'in-open';
        i += 1;
        continue;
      }
      if (
        (token.kind === 'op' && COMPARE_OPS.has(token.value)) ||
        (token.kind === 'keyword' && (token.value === 'LIKE' || token.value === 'ILIKE'))
      ) {
        expect = 'value';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'is-tail') {
      if (token.kind === 'keyword' && token.value === 'NULL') {
        expect = 'and';
        i += 1;
        continue;
      }
      if (token.kind === 'keyword' && token.value === 'NOT') {
        i += 1;
        if (tokens[i]?.kind === 'keyword' && tokens[i]?.value === 'NULL') {
          expect = 'and';
          i += 1;
        }
        continue;
      }
      break;
    }
    if (expect === 'value') {
      if (token.kind === 'string' || token.kind === 'number' || token.kind === 'ident') {
        expect = 'and';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'in-open') {
      if (token.kind === 'lparen') {
        expect = 'in-value';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'in-value') {
      if (token.kind === 'string' || token.kind === 'number' || token.kind === 'ident') {
        expect = 'in-sep';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'in-sep') {
      if (token.kind === 'comma') {
        expect = 'in-value';
        i += 1;
        continue;
      }
      if (token.kind === 'rparen') {
        expect = 'and';
        i += 1;
        continue;
      }
      break;
    }
    if (expect === 'and') {
      if (token.kind === 'keyword' && token.value === 'AND') {
        expect = 'column';
        column = undefined;
        i += 1;
        continue;
      }
      break;
    }
    break;
  }
  return { expect, column };
}

function suggestionsFor(
  expect: ExpectKind,
  columns: ColumnDefinition[],
  valueHints: Record<string, string[]>,
  column?: string
): Omit<FilterCompletion, 'from' | 'to'>[] {
  if (expect === 'column') {
    return columns.map((item) => ({
      label: item.name,
      apply: `${formatColumn(item.name)} `,
      type: 'column' as const,
    }));
  }
  if (expect === 'operator') {
    return OPERATOR_COMPLETIONS.map((item) => ({
      ...item,
      type: 'operator' as const,
    }));
  }
  if (expect === 'is-tail') {
    return [
      { label: 'NULL', apply: ' NULL ', type: 'keyword' as const },
      { label: 'NOT NULL', apply: ' NOT NULL ', type: 'keyword' as const },
    ];
  }
  if (expect === 'value' || expect === 'in-value') {
    const hints = column ? (valueHints[column] ?? []) : [];
    return hints.map((hint) => ({
      label: hint,
      apply: `${formatValue('=', hint)} `,
      type: 'value' as const,
    }));
  }
  if (expect === 'in-open') {
    return [{ label: '(', apply: '(', type: 'operator' as const }];
  }
  if (expect === 'in-sep') {
    return [
      { label: ',', apply: ', ', type: 'operator' as const },
      { label: ')', apply: ') ', type: 'operator' as const },
    ];
  }
  return [];
}

function matchesNeedle(item: Omit<FilterCompletion, 'from' | 'to'>, needle: string): boolean {
  if (!needle.trim()) return true;
  const n = needle.trim().toLowerCase().replace(/^['"]|['"]$/g, '');
  return item.label.toLowerCase().includes(n) || item.apply.toLowerCase().includes(n);
}
