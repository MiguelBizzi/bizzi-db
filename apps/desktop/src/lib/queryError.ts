import type {
  QueryErrorCategory,
  QueryErrorInfo,
  QueryErrorPosition,
  QueryExecutionResult,
} from '../types';
import { queryErrorText } from './sqlQuery';

const CATEGORY_LABELS: Record<QueryErrorCategory, string> = {
  syntax: 'Syntax error',
  reference: 'Reference error',
  constraint: 'Constraint violation',
  permission: 'Permission denied',
  connection: 'Connection error',
  timeout: 'Timeout',
  other: 'Error',
};

const EXCERPT_WIDTH = 120;
const ELLIPSIS = '…';

export function categoryLabel(category: QueryErrorCategory): string {
  return CATEGORY_LABELS[category];
}

export interface ErrorExcerpt {
  lineNumber: number;
  text: string;
  /** 1-based column within `text` that the caret should point at. */
  caretColumn: number;
}

/** The line of `query` the error is on, trimmed to a readable width around the caret. */
export function errorExcerpt(
  query: string,
  position: QueryErrorPosition | undefined
): ErrorExcerpt | null {
  if (!position) return null;
  const line = query.split(/\r?\n/)[position.line - 1];
  if (line === undefined) return null;
  if (line.length <= EXCERPT_WIDTH) {
    return { lineNumber: position.line, text: line, caretColumn: position.column };
  }
  const start = Math.max(0, position.column - 1 - EXCERPT_WIDTH / 2);
  const end = Math.min(line.length, start + EXCERPT_WIDTH);
  const lead = start > 0 ? ELLIPSIS : '';
  const tail = end < line.length ? ELLIPSIS : '';
  return {
    lineNumber: position.line,
    text: lead + line.slice(start, end) + tail,
    caretColumn: position.column - start + lead.length,
  };
}

/** Labelled details worth showing under the message, in display order. */
export function errorFacts(info: QueryErrorInfo): { label: string; value: string }[] {
  const rows: [string, string | undefined][] = [
    ['Detail', info.detail],
    ['Constraint', info.constraint],
    ['Table', info.table],
    ['Column', info.column],
    ['Schema', info.schema],
  ];
  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

/** Plain text of what `QueryErrorCard` shows, for the clipboard. */
export function queryErrorCopyText(result: QueryExecutionResult): string {
  const info = result.errorInfo;
  if (!info) return queryErrorText(result.error);

  const lines = [
    categoryLabel(info.category) +
      (info.code || info.vendorCode != null
        ? ` (${[info.code, info.vendorCode].filter((part) => part != null && part !== '').join(' · ')})`
        : ''),
    info.message,
  ];
  const excerpt = errorExcerpt(result.query, info.position);
  if (info.position && excerpt) {
    const gutter = String(excerpt.lineNumber).length + 3;
    lines.push(
      `Line ${info.position.line}, column ${info.position.column}`,
      `${excerpt.lineNumber} │ ${excerpt.text}`,
      `${' '.repeat(gutter + excerpt.caretColumn - 1)}^`
    );
  }
  for (const fact of errorFacts(info)) lines.push(`${fact.label}: ${fact.value}`);
  if (info.hint) lines.push(`Hint: ${info.hint}`);
  return lines.join('\n');
}
