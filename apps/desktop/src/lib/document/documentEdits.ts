import type { DocValue } from '@db/shared';
import { documentSelectionKey } from './collectionView';
import { newDocumentTemplate } from './docEdit';
import { documentId, formatEditable } from './docTree';

/**
 * Unsaved tree edits by selection key. `original` is the document as it was loaded before the
 * first edit: the server compares it with the stored document, so a refresh must not replace it.
 */
export type DocumentEdits = Readonly<Record<string, { original: DocValue; edited: DocValue }>>;

export function recordEdit(edits: DocumentEdits, key: string, current: DocValue, edited: DocValue): DocumentEdits {
  const original = edits[key]?.original ?? current;
  const { [key]: _, ...rest } = edits;
  if (formatEditable(original) === formatEditable(edited)) return rest;
  return { ...rest, [key]: { original, edited } };
}

export function withEdits(docs: DocValue[], edits: DocumentEdits): DocValue[] {
  return docs.map((doc) => {
    const key = documentSelectionKey(doc);
    return (key !== undefined && edits[key]?.edited) || doc;
  });
}

/** Returns `edits` itself when nothing is dropped, so a reload does not re-render for nothing. */
export function retainEdits(edits: DocumentEdits, docs: DocValue[]): DocumentEdits {
  const present = new Set(docs.map(documentSelectionKey));
  const kept = Object.entries(edits).filter(([key]) => present.has(key));
  return kept.length === Object.keys(edits).length ? edits : Object.fromEntries(kept);
}

export function dirtyIndices(docs: DocValue[], edits: DocumentEdits): number[] {
  const indices: number[] = [];
  docs.forEach((doc, i) => {
    const key = documentSelectionKey(doc);
    if (key !== undefined && edits[key]) indices.push(i);
  });
  return indices;
}

// The exact text of `CONFLICT` in `crates/mongo/src/session.rs`; errors reach the UI as plain strings.
const CONFLICT_MESSAGE = 'The document changed on the server after it was loaded.';

export function isConflictError(message: string): boolean {
  return message.includes(CONFLICT_MESSAGE);
}

export function idFilter(id: DocValue): string {
  return `{"_id": ${formatEditable(id)}}`;
}

/** The document without its `_id`, so inserting it makes a copy with a new id. */
export function cloneText(doc: DocValue): string {
  if (doc.t !== 'object' || !documentId(doc)) return formatEditable(doc);
  const rest: DocValue = { t: 'object', entries: doc.entries.filter(([k]) => k !== '_id') };
  return rest.entries.length === 0 ? newDocumentTemplate() : formatEditable(rest);
}

export function deletePrompt(count: number): string {
  return `Delete ${count} document${count === 1 ? '' : 's'}?`;
}
