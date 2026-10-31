import type { ColumnDefinition, DatabaseDialect, FilterClause } from '../types';
import { ident } from './dialectQuote';
import { enumValuesFor } from './insertRow';
import { filterNeedsValue } from './tableFilters';

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
  if (!text.trim()) return { status: 'incomplete' };

  const clauses: ParsedFilterClause[] = [];
  let pos = 0;
  while (true) {
    const result = parseClause(text, pos, columns);
    if (result.status !== 'ok') return result;
    clauses.push(result.clause);

    const next = skipSpaces(text, result.end);
    if (next >= text.length) return { status: 'ok', clauses };
    const word = wordAt(text, next).toUpperCase();
    if (word === 'AND') {
      pos = next + 3;
      if (!text.slice(pos).trim()) return { status: 'incomplete' };
      continue;
    }
    if (word === 'OR') {
      return { status: 'error', message: 'OR is not supported; combine conditions with AND' };
    }
    return { status: 'error', message: `Unexpected token '${tokenAt(text, next)}'` };
  }
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

function formatColumn(name: string, dialect: DatabaseDialect = 'PostgreSQL'): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || KEYWORDS.has(name.toUpperCase())) {
    return ident(dialect, name);
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
    // Symbols the grammar doesn't know (@, %, .) belong to unquoted values.
    const start = i;
    i += 1;
    while (i < text.length && !/[\s(),=<>'"]/.test(text[i]!)) i += 1;
    tokens.push({ kind: 'ident', value: text.slice(start, i), start, end: i });
  }
  return tokens;
}

type ClauseResult =
  | { status: 'ok'; clause: ParsedFilterClause; end: number }
  | { status: 'incomplete' }
  | { status: 'error'; message: string };

const SYMBOL_OPERATORS = ['>=', '<=', '<>', '!=', '=', '>', '<'];
const NOT_SUPPORTED: ClauseResult = { status: 'error', message: 'NOT is not supported' };
const BETWEEN_NOT_SUPPORTED: ClauseResult = {
  status: 'error',
  message: 'BETWEEN is not supported',
};

// Values are the rest of the clause up to the next AND, so quotes are optional.
function parseClause(s: string, start: number, columns: string[]): ClauseResult {
  const i = skipSpaces(s, start);
  if (i >= s.length) return { status: 'incomplete' };
  if (s[i] === '(') return { status: 'error', message: 'Parentheses are not supported' };

  const col = readColumn(s, i, columns);
  if ('unknown' in col) {
    const lead = wordAt(s, i).toUpperCase();
    if (lead === 'NOT') return NOT_SUPPORTED;
    if (lead === 'BETWEEN') return BETWEEN_NOT_SUPPORTED;
    if (skipSpaces(s, col.end) >= s.length && couldBeColumnPrefix(col.unknown, columns)) {
      return { status: 'incomplete' };
    }
    return {
      status: 'error',
      message: `Invalid expression: '${col.unknown}' is not a valid column`,
    };
  }

  const j = skipSpaces(s, col.end);
  if (j >= s.length) return { status: 'incomplete' };

  const symbol = SYMBOL_OPERATORS.find((op) => s.startsWith(op, j));
  if (symbol) {
    const operator = (symbol === '<>' ? '!=' : symbol) as FilterClause['operator'];
    return parseValueClause(s, j + symbol.length, col.column, operator, columns);
  }

  const word = wordAt(s, j).toUpperCase();
  const afterWord = j + word.length;
  switch (word) {
    case 'LIKE':
    case 'ILIKE':
      return parseValueClause(s, afterWord, col.column, word, columns);
    case 'IN':
      return parseInClause(s, afterWord, col.column, columns);
    case 'IS':
      return parseIsClause(s, afterWord, col.column);
    case 'BETWEEN':
      return BETWEEN_NOT_SUPPORTED;
    case 'NOT':
      return NOT_SUPPORTED;
    case 'AND':
      return { status: 'incomplete' };
    default:
      return { status: 'error', message: `Unexpected token '${tokenAt(s, j)}'` };
  }
}

function parseIsClause(s: string, from: number, column: string): ClauseResult {
  const k = skipSpaces(s, from);
  if (k >= s.length) return { status: 'incomplete' };
  const first = wordAt(s, k).toUpperCase();
  if (first === 'NULL') {
    return { status: 'ok', clause: { column, operator: 'IS NULL', value: '' }, end: k + 4 };
  }
  if (first !== 'NOT') return { status: 'incomplete' };

  const m = skipSpaces(s, k + 3);
  if (m >= s.length) return { status: 'incomplete' };
  const second = wordAt(s, m).toUpperCase();
  if (second === 'NULL') {
    return { status: 'ok', clause: { column, operator: 'IS NOT NULL', value: '' }, end: m + 4 };
  }
  if ('NULL'.startsWith(second)) return { status: 'incomplete' };
  return NOT_SUPPORTED;
}

function parseValueClause(
  s: string,
  from: number,
  column: string,
  operator: FilterClause['operator'],
  columns: string[]
): ClauseResult {
  const span = readValueSpan(s, from, columns);
  if (!span.raw) return { status: 'incomplete' };
  return {
    status: 'ok',
    clause: { column, operator, value: unwrapValue(span.raw) },
    end: span.end,
  };
}

function parseInClause(s: string, from: number, column: string, columns: string[]): ClauseResult {
  const i = skipSpaces(s, from);
  if (i >= s.length) return { status: 'incomplete' };

  let items: string[];
  let end: number;
  if (s[i] === '(') {
    const list = readItemList(s, i + 1);
    if (!list) return { status: 'incomplete' };
    ({ items, end } = list);
  } else {
    const span = readValueSpan(s, from, columns);
    const list = readItemList(`${span.raw})`, 0);
    if (!list) return { status: 'incomplete' };
    ({ items } = list);
    end = span.end;
  }
  if (items.length === 0) return { status: 'incomplete' };
  return { status: 'ok', clause: { column, operator: 'IN', value: items.join(', ') }, end };
}

function readItemList(s: string, from: number): { items: string[]; end: number } | null {
  const items: string[] = [];
  let i = from;
  while (true) {
    i = skipSpaces(s, i);
    if (i >= s.length) return null;

    let item: string | null = null;
    let next = i;
    if (isQuote(s[i])) {
      const quoted = readQuoted(s, i);
      if (!quoted) return null;
      const after = skipSpaces(s, quoted.end);
      if (s[after] === ',' || s[after] === ')') {
        item = quoted.value;
        next = after;
      }
    }
    if (item === null) {
      next = i;
      while (next < s.length && s[next] !== ',' && s[next] !== ')') next += 1;
      if (next >= s.length) return null;
      item = s.slice(i, next).trim();
    }
    if (item !== '') items.push(item);

    if (s[next] === ')') return { items, end: next + 1 };
    i = next + 1;
  }
}

function readColumn(
  s: string,
  i: number,
  columns: string[]
): { column: string; end: number } | { unknown: string; end: number } {
  if (s[i] === '"') {
    const quoted = readQuoted(s, i);
    const name = quoted ? quoted.value : s.slice(i + 1);
    const end = quoted ? quoted.end : s.length;
    const column = resolveColumn(name, columns);
    return column ? { column, end } : { unknown: name, end };
  }
  const matched = matchBareColumn(s, i, columns);
  if (matched) return matched;
  const word = /^[^\s=<>!(),]+/.exec(s.slice(i))?.[0] ?? s[i]!;
  return { unknown: word, end: i + word.length };
}

// Longest column name that starts at `i`, so "first name" beats "first".
function matchBareColumn(
  s: string,
  i: number,
  columns: string[]
): { column: string; end: number } | null {
  let best: string[] = [];
  for (const column of columns) {
    if (!column) continue;
    const candidate = s.slice(i, i + column.length);
    if (candidate.toLowerCase() !== column.toLowerCase()) continue;
    const boundary = s[i + column.length];
    if (boundary !== undefined && !/[\s=<>!(),]/.test(boundary)) continue;
    if (best.length === 0 || column.length > best[0]!.length) best = [column];
    else if (column.length === best[0]!.length) best.push(column);
  }
  const column = best.find((name) => s.startsWith(name, i)) ?? (best.length === 1 ? best[0] : undefined);
  return column ? { column, end: i + column.length } : null;
}

// AND/OR only split a value when a condition follows them; otherwise they are part of the text.
function readValueSpan(s: string, from: number, columns: string[]): { raw: string; end: number } {
  const valueStart = skipSpaces(s, from);
  let scanFrom = from;
  if (isQuote(s[valueStart])) {
    const quoted = readQuoted(s, valueStart);
    if (quoted) scanFrom = quoted.end;
  }
  const connector = /\s+(?:AND|OR)(?=\s|$)/gi;
  connector.lastIndex = scanFrom;
  for (let m = connector.exec(s); m; m = connector.exec(s)) {
    if (startsCondition(s.slice(m.index + m[0].length), columns)) {
      return { raw: s.slice(valueStart, Math.max(m.index, valueStart)).trim(), end: m.index };
    }
  }
  return { raw: s.slice(valueStart).trim(), end: s.length };
}

function startsCondition(rest: string, columns: string[]): boolean {
  const text = rest.trimStart();
  if (!text || text[0] === '"' || /^NOT\s/i.test(text)) return true;
  if (matchBareColumn(text, 0, columns)) return true;
  const lower = text.toLowerCase();
  return columns.some((column) => column.toLowerCase().startsWith(lower));
}

function unwrapValue(raw: string): string {
  if (isQuote(raw[0])) {
    const quoted = readQuoted(raw, 0);
    if (!quoted) return raw.slice(1);
    return quoted.end === raw.length ? quoted.value : raw;
  }
  return /^(true|false|null)$/i.test(raw) ? raw.toLowerCase() : raw;
}

function readQuoted(s: string, i: number): { value: string; end: number } | null {
  const quote = s[i]!;
  let value = '';
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === quote) {
      if (s[j + 1] === quote) {
        value += quote;
        j += 2;
        continue;
      }
      return { value, end: j + 1 };
    }
    value += s[j];
    j += 1;
  }
  return null;
}

function isQuote(c: string | undefined): boolean {
  return c === "'" || c === '"';
}

function skipSpaces(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j]!)) j += 1;
  return j;
}

function wordAt(s: string, i: number): string {
  return /^[A-Za-z]+/.exec(s.slice(i))?.[0] ?? '';
}

function tokenAt(s: string, i: number): string {
  return /^\S+/.exec(s.slice(i))?.[0] ?? '';
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
      }
      i += 1;
      continue;
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
