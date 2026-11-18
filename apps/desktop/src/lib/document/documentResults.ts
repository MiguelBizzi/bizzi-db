import type { DocValue, DocumentCommandResult } from '@db/shared';
import type { ExportFile } from '@db/core';
import { formatEditable } from './docTree';

export function resultDocuments(result: DocumentCommandResult): DocValue[] {
  if (result.documents) return result.documents;
  return result.value ? [result.value] : [];
}

/** Time, document count and affected, as the short labels shown on a result panel. */
export function resultSummary(result: DocumentCommandResult): string[] {
  const parts = [`${result.executionTimeMs} ms`];
  if (result.documents) {
    const n = result.documents.length;
    parts.push(`${n} ${n === 1 ? 'document' : 'documents'}`);
  }
  if (result.affected != null) parts.push(`${result.affected} affected`);
  return parts;
}

export function resultExportFile(result: DocumentCommandResult, name: string): ExportFile {
  const body = resultDocuments(result).map((doc) => formatEditable(doc));
  return {
    fileName: `${name || 'result'}.json`,
    filterLabel: 'JSON',
    extension: 'json',
    content: `[${body.join(',\n')}]\n`,
  };
}

/** The last run of a document query tab; `text` is exactly what was sent, which error positions refer to. */
export interface DocumentQueryState {
  results: DocumentCommandResult[];
  text: string;
  /** Where `text` starts in the editor. */
  offset: number;
  /** The database runs go to; only meaningful once `databasePicked`, until then it follows the schema. */
  database: string;
  databasePicked: boolean;
}

export const EMPTY_DOCUMENT_QUERY_STATE: DocumentQueryState = {
  results: [],
  text: '',
  offset: 0,
  database: '',
  databasePicked: false,
};

export function defaultQueryDatabase(
  profileDatabase: string,
  collections: readonly { database: string }[],
): string {
  return profileDatabase || collections[0]?.database || 'test';
}
