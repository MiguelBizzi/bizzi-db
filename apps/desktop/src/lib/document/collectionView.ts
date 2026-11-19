import type { CollectionSchema, DocValue, DocumentPage, QueryExecutionResult } from '@db/shared';
import { documentId, formatEditable } from './docTree';

export const DOCUMENT_PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_DOCUMENT_PAGE_SIZE = 50;

/**
 * A view has no documents of its own, and a time-series collection refuses whole-document
 * replaces, so both are read-only here.
 */
export function collectionWritable(collection: Pick<CollectionSchema, 'kind'>): boolean {
  return collection.kind === 'collection';
}

export function readOnlyBadge(collection: Pick<CollectionSchema, 'kind'>): string | null {
  if (collection.kind === 'view') return 'Read-only view';
  if (collection.kind === 'timeseries') return 'Read-only time series';
  return null;
}

/** Time-series collections take secondary indexes; a view has no indexes of its own. */
export function collectionIndexesManageable(collection: Pick<CollectionSchema, 'kind'>): boolean {
  return collection.kind !== 'view';
}

/** The filter with `"<path>": ` added and the caret where its value goes, just before the `}`. */
export function insertFieldFilter(filter: string, path: string): { text: string; caret: number } {
  const field = `${JSON.stringify(path)}: `;
  const trimmed = filter.trim();
  const body = trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1).trim() : '';
  const text = body ? `{ ${body.replace(/,\s*$/, '')}, ${field}}` : `{ ${field}}`;
  return { text, caret: text.length - 1 };
}

/**
 * Selection is keyed by `_id` so a refresh that reorders, inserts or deletes documents cannot move
 * it onto another document. `undefined` means the document has no `_id` and cannot be selected,
 * since edits and deletes address documents by id.
 */
export function documentSelectionKey(doc: DocValue): string | undefined {
  const id = documentId(doc);
  return id ? formatEditable(id) : undefined;
}

/** Selection keys after a click; `toggle` is a ⌘/Ctrl-click. */
export function selectDocument(selected: readonly string[], key: string, toggle: boolean): string[] {
  if (!toggle) return [key];
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

export function retainSelection(selected: readonly string[], docs: DocValue[]): string[] {
  const present = new Set(docs.map(documentSelectionKey));
  return selected.filter((key) => present.has(key));
}

export function selectedIndices(selected: readonly string[], docs: DocValue[]): number[] {
  const keys = new Set(selected);
  const indices: number[] = [];
  docs.forEach((doc, i) => {
    const key = documentSelectionKey(doc);
    if (key !== undefined && keys.has(key)) indices.push(i);
  });
  return indices;
}

/** `total` is `null` when the count did not finish in time. */
export function pageRangeLabel(skip: number, shown: number, total: number | null): string {
  // Without a total, a full last page leaves Next enabled onto an empty one.
  if (shown === 0) return skip === 0 ? 'No documents' : 'No more documents';
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
