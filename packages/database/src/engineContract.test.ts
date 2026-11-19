import { describe, expect, test } from 'bun:test';
import { ENGINES, SUPPORTED_DIALECTS, isDocumentEngine, type EngineCapabilities } from './index';

const CAPABILITY_FLAGS: (keyof EngineCapabilities)[] = [
  'transactionalDdl',
  'materializedViews',
  'routineOverloading',
  'orReplaceRoutines',
  'partialIndexes',
  'onlineIndexBuild',
  'explainPlanTree',
  'routines',
  'emptyDatabaseAllowed',
  'dollarQuotes',
  'hashComments',
  'backtickIdents',
  'ilike',
  'invalidIndexes',
  'bracketIdents',
  'batchSeparator',
  'identityColumns',
];

describe('engine contract', () => {
  test('every supported dialect fills the shared hooks', () => {
    expect(SUPPORTED_DIALECTS.length).toBeGreaterThan(0);
    for (const engine of SUPPORTED_DIALECTS) {
      expect(engine.transaction.begin.length).toBeGreaterThan(0);
      expect(engine.transaction.commit.length).toBeGreaterThan(0);
      expect(engine.limitClause(10, 0)).toContain('10');
      expect(engine.caseInsensitiveLike('col', "'a'")).toContain('col');
      expect(engine.emptyEditorSql.length).toBeGreaterThan(0);
      expect(typeof engine.requiresSchemaOnCreate).toBe('boolean');
      expect(engine.currentTimestamp.length).toBeGreaterThan(0);
      expect(engine.scriptSeparator.length).toBeGreaterThan(0);
      expect(typeof engine.pagingRequiresOrder).toBe('boolean');
      expect(engine.defaultPort).toBeGreaterThan(0);
      expect(engine.uriSchemes.length).toBeGreaterThan(0);
      expect(engine.quoteIdent('a')).not.toBe('a');
      expect(engine.quoteLiteral('a')).toContain('a');
      expect(engine.objects.indexes.methods.length).toBeGreaterThan(0);
      expect(engine.objects.routines.kinds.length).toBeGreaterThan(0);
      for (const flag of CAPABILITY_FLAGS) {
        expect(typeof engine.capabilities[flag]).toBe('boolean');
      }
    }
  });

  test('every document engine fills the document hooks', () => {
    const documents = Object.values(ENGINES).filter(isDocumentEngine);
    expect(documents.length).toBeGreaterThan(0);
    for (const engine of documents) {
      expect(engine.emptyEditorText.length).toBeGreaterThan(0);
      expect(engine.indexKeyKinds.length).toBeGreaterThan(0);
      expect(Object.keys(engine.documentCapabilities).length).toBe(7);
      for (const flag of Object.values(engine.documentCapabilities)) {
        expect(typeof flag).toBe('boolean');
      }
    }
  });
});
