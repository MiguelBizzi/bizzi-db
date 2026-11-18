import { describe, expect, test } from 'bun:test';
import {
  DIALECTS,
  ENGINES,
  SUPPORTED_ENGINES,
  dialectModule,
  documentEngine,
  engineMeta,
  isDocumentEngine,
} from './index';

const RUST_PARAM_ALLOWLIST = [
  'srv',
  'authSource',
  'authMechanism',
  'replicaSet',
  'directConnection',
  'readPreference',
  'hosts',
];

describe('engine registry', () => {
  test('MongoDB is a document engine with collection nouns', () => {
    const meta = engineMeta('MongoDB');
    expect(isDocumentEngine(meta)).toBe(true);
    expect(meta?.nouns.container).toBe('Collection');
    expect(documentEngine('MongoDB')?.id).toBe('MongoDB');
    expect(documentEngine('PostgreSQL')).toBeUndefined();
  });

  test('MongoDB is not a SQL dialect', () => {
    expect(dialectModule('MongoDB')).toBeUndefined();
  });

  test('relational engines carry the shared meta', () => {
    for (const dialect of Object.values(DIALECTS)) {
      expect(dialect.paradigm).toBe('relational');
      expect(dialect.databaseOptional).toBe(dialect.capabilities.emptyDatabaseAllowed);
      expect(dialect.connectionParams).toEqual([]);
      expect(dialect.nouns.container).toBe('Table');
      expect(dialect.supported).toBe(true);
    }
  });

  test('connectionParams keys equal the Rust allowlist', () => {
    expect(ENGINES.MongoDB.connectionParams.map((p) => p.key)).toEqual(RUST_PARAM_ALLOWLIST);
    expect(ENGINES.MongoDB.portHiddenBy).toBe('srv');
  });

  test('picker lists supported engines, relational first', () => {
    expect(SUPPORTED_ENGINES.map((e) => e.id)).toEqual(['PostgreSQL', 'MySQL', 'SQLServer', 'MongoDB']);
    expect(Object.keys(ENGINES)).toEqual(['PostgreSQL', 'MySQL', 'SQLServer', 'MongoDB']);
  });
});
