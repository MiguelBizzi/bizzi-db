import { invoke } from '@tauri-apps/api/core';
import type {
  DocValue,
  DocumentCommandResult,
  DocumentExportRequest,
  DocumentPage,
  FieldSample,
  FindRequest,
  IndexDraft,
  Namespace,
  SqlRange,
} from '@db/shared';

export function documentsFind(input: FindRequest): Promise<DocumentPage> {
  return invoke('documents_find', { input });
}

export function documentsSampleFields(connectionId: string, ns: Namespace, size: number): Promise<FieldSample> {
  return invoke('documents_sample_fields', { connectionId, ns, size });
}

export function documentsRun(
  connectionId: string,
  database: string,
  text: string,
  pageSize: number,
  recordHistory: boolean,
): Promise<DocumentCommandResult[]> {
  return invoke('documents_run', { connectionId, database, text, pageSize, recordHistory });
}

/** Resolves to the inserted `_id`. */
export function documentsInsert(connectionId: string, ns: Namespace, document: string): Promise<DocValue> {
  return invoke('documents_insert', { connectionId, ns, document });
}

export function documentsReplace(
  connectionId: string,
  ns: Namespace,
  original: string,
  replacement: string,
): Promise<void> {
  return invoke('documents_replace', { connectionId, ns, original, replacement });
}

/** Resolves to the number of deleted documents. */
export function documentsDelete(connectionId: string, ns: Namespace, ids: string[]): Promise<number> {
  return invoke('documents_delete', { connectionId, ns, ids });
}

/** Resolves to the saved path, or `null` when the user cancels the save dialog. */
export function documentsExport(input: DocumentExportRequest): Promise<string | null> {
  return invoke('documents_export', { input });
}

export function documentStatementRanges(connectionId: string, text: string): Promise<SqlRange[]> {
  return invoke('document_statement_ranges', { connectionId, text });
}

export function collectionCreate(connectionId: string, ns: Namespace): Promise<void> {
  return invoke('collection_create', { connectionId, ns });
}

export function collectionDrop(connectionId: string, ns: Namespace): Promise<void> {
  return invoke('collection_drop', { connectionId, ns });
}

/** Resolves to the created index name. */
export function collectionIndexCreate(connectionId: string, ns: Namespace, draft: IndexDraft): Promise<string> {
  return invoke('collection_index_create', { connectionId, ns, draft });
}

export function collectionIndexDrop(connectionId: string, ns: Namespace, name: string): Promise<void> {
  return invoke('collection_index_drop', { connectionId, ns, name });
}
