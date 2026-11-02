import { SUPPORTED_DIALECTS } from '@db/database';
import { describe, expect, test } from 'bun:test';
import { objectDdlFor, tableDdlFor } from './registry';

describe('engine DDL contract', () => {
  test('every supported dialect has table and object builders', () => {
    for (const engine of SUPPORTED_DIALECTS) {
      expect(tableDdlFor(engine.id), engine.label).toBeDefined();
      expect(objectDdlFor(engine.id), engine.label).toBeDefined();
    }
  });
});
