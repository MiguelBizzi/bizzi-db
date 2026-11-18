import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DocValue } from '@db/shared';
import { bsonAliasLabel, documentId, flattenTree, formatEditable, previewText, treeKey, typeLabel } from './docTree';

interface FixtureEntry {
  name: string;
  value: DocValue;
  text: string;
}

const fixture: FixtureEntry[] = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dir, '../../../../../crates/mongo/tests/fixtures/editable.json'),
    'utf8',
  ),
);

const int32 = (v: number): DocValue => ({ t: 'int32', v: String(v) });
const str = (v: string): DocValue => ({ t: 'string', v });
const obj = (...entries: [string, DocValue][]): DocValue => ({ t: 'object', entries });
const arr = (...items: DocValue[]): DocValue => ({ t: 'array', items });
const oid: DocValue = { t: 'objectId', v: '507f1f77bcf86cd799439011' };

describe('formatEditable', () => {
  test('matches the Rust fixture', () => {
    expect(fixture.length).toBeGreaterThan(40);
    const mismatches = fixture
      .filter((entry) => formatEditable(entry.value) !== entry.text)
      .map((entry) => entry.name);
    expect(mismatches).toEqual([]);
  });

  test('keeps entry order', () => {
    expect(formatEditable(obj(['10', int32(1)], ['2', int32(2)]))).toBe('{\n  "10": 1,\n  "2": 2\n}');
  });
});

describe('typeLabel', () => {
  test('names BSON types', () => {
    expect(typeLabel(str('a'))).toBe('String');
    expect(typeLabel(int32(1))).toBe('Int32');
    expect(typeLabel({ t: 'int64', v: '1' })).toBe('Int64');
    expect(typeLabel({ t: 'double', v: '1.5' })).toBe('Double');
    expect(typeLabel({ t: 'decimal128', v: '1.10' })).toBe('Decimal128');
    expect(typeLabel(oid)).toBe('ObjectId');
    expect(typeLabel({ t: 'date', v: '2024-01-02T03:04:05.006Z' })).toBe('Date');
    expect(typeLabel({ t: 'binary', subtype: 0, base64: '' })).toBe('Binary');
    expect(typeLabel({ t: 'timestamp', seconds: 1, increment: 2 })).toBe('Timestamp');
    expect(typeLabel({ t: 'regex', pattern: 'a', options: '' })).toBe('Regex');
    expect(typeLabel(obj())).toBe('Object');
    expect(typeLabel(arr())).toBe('Array');
    expect(typeLabel({ t: 'null' })).toBe('Null');
    expect(typeLabel({ t: 'bool', v: true })).toBe('Boolean');
  });

  test('reads the wrapper of an EJSON fallback', () => {
    expect(typeLabel({ t: 'other', ejson: '{"$code": "x"}' })).toBe('Code');
    expect(typeLabel({ t: 'other', ejson: '{"$symbol": "s"}' })).toBe('Symbol');
    expect(typeLabel({ t: 'other', ejson: '{"$date": {"$numberLong": "1"}}' })).toBe('Date');
  });
});

describe('bsonAliasLabel', () => {
  test('maps the sampler aliases to the tree labels', () => {
    expect(bsonAliasLabel('int')).toBe('Int32');
    expect(bsonAliasLabel('long')).toBe('Int64');
    expect(bsonAliasLabel('decimal')).toBe('Decimal128');
    expect(bsonAliasLabel('binData')).toBe('Binary');
    expect(bsonAliasLabel('javascriptWithScope')).toBe('Code');
    expect(bsonAliasLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('previewText', () => {
  test('summarises containers', () => {
    expect(previewText(obj(['a', int32(1)], ['b', int32(2)], ['c', int32(3)]))).toBe('{ 3 fields }');
    expect(previewText(obj(['a', int32(1)]))).toBe('{ 1 field }');
    expect(previewText(arr(int32(1), int32(2), int32(3), int32(4), int32(5)))).toBe('[ 5 items ]');
    expect(previewText(arr(int32(1)))).toBe('[ 1 item ]');
    expect(previewText(obj())).toBe('{}');
    expect(previewText(arr())).toBe('[]');
  });

  test('shows scalars the way the shell does', () => {
    expect(previewText(oid)).toBe("ObjectId('507f1f77bcf86cd799439011')");
    expect(previewText({ t: 'date', v: '2024-01-02T03:04:05.006Z' })).toBe('2024-01-02T03:04:05.006Z');
    expect(previewText(str('hi'))).toBe('"hi"');
    expect(previewText({ t: 'int64', v: '9007199254740993' })).toBe('9007199254740993');
    expect(previewText({ t: 'null' })).toBe('null');
  });

  test('truncates long strings with an ellipsis', () => {
    const text = previewText(str('x'.repeat(200)), 20);
    expect(text).toBe(`"${'x'.repeat(18)}…`);
    expect(text.length).toBe(20);
  });

  test('keeps string previews on one line', () => {
    expect(previewText(str('a\nb'))).toBe('"a\\nb"');
  });
});

describe('flattenTree', () => {
  const docs = [
    obj(['_id', oid], ['address', obj(['city', str('Lisbon')])], ['tags', arr(str('a'), str('b'))]),
    obj(['_id', int32(2)]),
  ];

  test('opens documents and leaves nested values closed', () => {
    const rows = flattenTree(docs, new Set());
    expect(rows.map((r) => [r.docIndex, r.depth, r.key, r.expanded])).toEqual([
      [0, 0, "ObjectId('507f1f77bcf86cd799439011')", true],
      [0, 1, '_id', false],
      [0, 1, 'address', false],
      [0, 1, 'tags', false],
      [1, 0, '2', true],
      [1, 1, '_id', false],
    ]);
    expect(rows[2].expandable).toBe(true);
    expect(rows[1].expandable).toBe(false);
    expect(rows[2].path).toEqual(['address']);
  });

  test('opens nested values in the expanded set', () => {
    const rows = flattenTree(docs, new Set([treeKey(0, ['tags'])]));
    const tags = rows.filter((r) => r.docIndex === 0 && r.depth === 2);
    expect(tags.map((r) => [r.key, r.path])).toEqual([
      ['0', ['tags', 0]],
      ['1', ['tags', 1]],
    ]);
    expect(rows.find((r) => r.key === 'tags')?.expanded).toBe(true);
  });

  test('a document key in the set closes that document', () => {
    const rows = flattenTree(docs, new Set([treeKey(1, [])]));
    expect(rows.filter((r) => r.docIndex === 1).map((r) => r.depth)).toEqual([0]);
    expect(rows[rows.length - 1].expanded).toBe(false);
  });

  test('keys are JSON of the document index and path', () => {
    expect(treeKey(3, ['a', 0])).toBe(JSON.stringify([3, 'a', 0]));
  });
});

describe('documentId', () => {
  test('finds _id', () => {
    expect(documentId(obj(['name', str('x')], ['_id', oid]))).toEqual(oid);
  });

  test('is undefined without one', () => {
    expect(documentId(obj(['name', str('x')]))).toBeUndefined();
    expect(documentId(int32(1))).toBeUndefined();
  });
});
