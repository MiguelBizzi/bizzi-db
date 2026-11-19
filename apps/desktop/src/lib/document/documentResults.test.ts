import { describe, expect, test } from 'bun:test';
import type { DocValue, DocumentCommandResult } from '@db/shared';
import { defaultQueryDatabase, resultDocuments, resultExportFile, resultSummary } from './documentResults';

const doc = (n: number): DocValue => ({ t: 'object', entries: [['n', { t: 'int32', v: String(n) }]] });

const base: DocumentCommandResult = {
  id: 'r1',
  command: 'db.users.find()',
  timestamp: '2026-01-01T00:00:00Z',
  executionTimeMs: 12,
};

describe('resultDocuments', () => {
  test('a cursor result lists its documents, a value result its single value', () => {
    expect(resultDocuments({ ...base, documents: [doc(1), doc(2)] })).toHaveLength(2);
    expect(resultDocuments({ ...base, value: doc(3) })).toHaveLength(1);
    expect(resultDocuments(base)).toEqual([]);
  });
});

describe('resultSummary', () => {
  test('lists time, document count and affected', () => {
    expect(resultSummary({ ...base, documents: [doc(1)] })).toEqual(['12 ms', '1 document']);
    expect(resultSummary({ ...base, documents: [doc(1), doc(2)], affected: 2 })).toEqual([
      '12 ms',
      '2 documents',
      '2 affected',
    ]);
    expect(resultSummary({ ...base, value: doc(1) })).toEqual(['12 ms']);
    expect(resultSummary({ ...base, affected: 0 })).toEqual(['12 ms', '0 affected']);
  });
});

describe('resultExportFile', () => {
  test('is a JSON array of the editable form of each document', () => {
    const file = resultExportFile({ ...base, documents: [doc(1), doc(2)] }, 'users');
    expect(file.extension).toBe('json');
    expect(file.fileName).toBe('users.json');
    expect(JSON.parse(file.content)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  test('falls back to a generic file name', () => {
    expect(resultExportFile({ ...base, value: doc(1) }, '').fileName).toBe('result.json');
  });
});

describe('defaultQueryDatabase', () => {
  const colls = [{ database: 'shop' }, { database: 'analytics' }];
  test('prefers the profile database, then the first collection database, then test', () => {
    expect(defaultQueryDatabase('main', colls)).toBe('main');
    expect(defaultQueryDatabase('', colls)).toBe('shop');
    expect(defaultQueryDatabase('', [])).toBe('test');
  });
});
