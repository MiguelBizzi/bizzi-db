import type { DatabaseDialect, Paradigm } from '@db/shared';

export type { Paradigm };

export interface ConnectionParamSpec {
  key: string;
  label: string;
  kind: 'text' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface EngineNouns {
  namespace: string;
  container: string;
  containers: string;
  record: string;
  records: string;
}

export interface EngineMeta {
  id: DatabaseDialect;
  label: string;
  paradigm: Paradigm;
  /** False keeps the engine out of the connection picker. */
  supported: boolean;
  defaultPort: number;
  defaultUser: string;
  defaultDatabase: string;
  defaultSsl: boolean;
  uriSchemes: string[];
  /** The connection's database field may be blank. */
  databaseOptional: boolean;
  /** Keys must match the Rust `params` allowlist. */
  connectionParams: ConnectionParamSpec[];
  /** Boolean param that, when 'true', hides the port field (SRV records carry the port). */
  portHiddenBy?: string;
  nouns: EngineNouns;
}

export interface DocumentCapabilities {
  views: boolean;
  textIndexes: boolean;
  geoIndexes: boolean;
  hashedIndexes: boolean;
  ttlIndexes: boolean;
  hiddenIndexes: boolean;
  partialIndexes: boolean;
}

export interface DocumentEngineMeta extends EngineMeta {
  paradigm: 'document';
  editorLanguage: 'javascript';
  emptyEditorText: string;
  indexKeyKinds: { value: string; label: string }[];
  documentCapabilities: DocumentCapabilities;
}
