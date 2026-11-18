import type { DocumentPage, QueryExecutionResult } from '@db/shared';

export const DOCUMENT_PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_DOCUMENT_PAGE_SIZE = 50;

/** The filter with `"<path>": ` added and the caret where its value goes, just before the `}`. */
export function insertFieldFilter(filter: string, path: string): { text: string; caret: number } {
  const field = `${JSON.stringify(path)}: `;
  const trimmed = filter.trim();
  const body = trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1).trim() : '';
  const text = body ? `{ ${body.replace(/,\s*$/, '')}, ${field}}` : `{ ${field}}`;
  return { text, caret: text.length - 1 };
}

/** Selected document indices after a click; `toggle` is a ⌘/Ctrl-click. */
export function selectDocument(selected: readonly number[], index: number, toggle: boolean): number[] {
  if (!toggle) return [index];
  return selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index];
}

/** `total` is `null` when the count did not finish in time. */
export function pageRangeLabel(skip: number, shown: number, total: number | null): string {
  if (shown === 0 && skip === 0) return 'No documents';
  const of = total == null ? 'many' : total.toLocaleString('en-US');
  return `${(skip + 1).toLocaleString('en-US')}–${(skip + shown).toLocaleString('en-US')} of ${of}`;
}

export function canPageForward(skip: number, shown: number, pageSize: number, total: number | null): boolean {
  if (total == null) return shown === pageSize;
  return skip + shown < total;
}

export interface FindInputs {
  filter: string;
  projection: string;
  sort: string;
}

/**
 * The page's error in the shape `QueryErrorCard` takes. The server does not say which input a
 * parse position refers to, so the excerpt is shown only when a single input has text.
 */
export function pageErrorResult(page: DocumentPage, inputs: FindInputs): QueryExecutionResult | null {
  if (!page.error) return null;
  const filled = [inputs.filter, inputs.projection, inputs.sort].filter((text) => text.trim() !== '');
  return {
    id: 'find',
    query: filled.length === 1 ? filled[0] : '',
    timestamp: '',
    executionTimeMs: page.executionTimeMs,
    error: page.error,
    errorInfo: page.errorInfo ?? undefined,
  };
}
