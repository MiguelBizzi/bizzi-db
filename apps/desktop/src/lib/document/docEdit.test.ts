import { describe, expect, test } from 'bun:test';
import type { DocValue } from '@db/shared';
import {
  DocEditError,
  addField,
  addFieldTarget,
  commitInlineEdit,
  convertScalar,
  getValue,
  insertItem,
  newDocumentTemplate,
  removeField,
  removeItem,
  renameField,
  rowEditCapabilities,
  scalarText,
  scalarTypeOf,
  setValue,
  uniqueFieldKey,
} from './docEdit';
import { formatEditable } from './docTree';

const str = (v: string): DocValue => ({ t: 'string', v });
const int32 = (v: string): DocValue => ({ t: 'int32', v });
const obj = (...entries: [string, DocValue][]): DocValue => ({ t: 'object', entries });
const arr = (...items: DocValue[]): DocValue => ({ t: 'array', items });
const oid: DocValue = { t: 'objectId', v: '507f1f77bcf86cd799439011' };

const keys = (v: DocValue) => (v.t === 'object' ? v.entries.map(([k]) => k) : []);

const user = obj(
  ['_id', oid],
  ['name', str('Ada')],
  ['address', obj(['street', str('1 Main')], ['city', str('London')], ['zip', str('N1')])],
  ['tags', arr(str('a'), str('b'))],
  ['credits', { t: 'int64', v: '5' }],
);

describe('tree edits', () => {
  test('setValue on nested path keeps sibling order', () => {
    const next = setValue(user, ['address', 'city'], str('Paris'));
    expect(keys(getValue(next, ['address']))).toEqual(['street', 'city', 'zip']);
    expect(getValue(next, ['address', 'city'])).toEqual(str('Paris'));
    expect(keys(next)).toEqual(keys(user));
    expect(getValue(user, ['address', 'city'])).toEqual(str('London'));
  });

  test('setValue on a missing path throws', () => {
    expect(() => setValue(user, ['address', 'country'], str('UK'))).toThrow(DocEditError);
    expect(() => setValue(user, ['tags', 5], str('x'))).toThrow(DocEditError);
  });

  test('renameField keeps position', () => {
    const next = renameField(user, ['address', 'city'], 'town');
    expect(keys(getValue(next, ['address']))).toEqual(['street', 'town', 'zip']);
    expect(getValue(next, ['address', 'town'])).toEqual(str('London'));
  });

  test('renameField refuses _id', () => {
    expect(() => renameField(user, ['_id'], 'id')).toThrow(DocEditError);
  });

  test('renameField refuses duplicate', () => {
    expect(() => renameField(user, ['address', 'city'], 'zip')).toThrow(/already/);
    expect(() => renameField(user, ['name'], '')).toThrow(DocEditError);
  });

  test('renameField to the same key is a no-op', () => {
    expect(renameField(user, ['name'], 'name')).toEqual(user);
  });

  test('addField after key', () => {
    const next = addField(user, ['address'], 'country', str('UK'), 'street');
    expect(keys(getValue(next, ['address']))).toEqual(['street', 'country', 'city', 'zip']);
    const appended = addField(user, [], 'age', int32('36'));
    expect(keys(appended).at(-1)).toBe('age');
    expect(() => addField(user, [], 'name', str('x'))).toThrow(/already/);
    expect(() => addField(user, ['tags'], 'x', str('x'))).toThrow(DocEditError);
  });

  test('insertItem and removeItem on array', () => {
    const inserted = insertItem(user, ['tags'], 1, str('z'));
    expect(getValue(inserted, ['tags'])).toEqual(arr(str('a'), str('z'), str('b')));
    const appended = insertItem(user, ['tags'], 2, str('c'));
    expect(getValue(appended, ['tags'])).toEqual(arr(str('a'), str('b'), str('c')));
    const removed = removeItem(inserted, ['tags'], 0);
    expect(getValue(removed, ['tags'])).toEqual(arr(str('z'), str('b')));
    expect(() => insertItem(user, ['tags'], 3, str('x'))).toThrow(DocEditError);
    expect(() => removeItem(user, ['tags'], 2)).toThrow(DocEditError);
    expect(getValue(user, ['tags'])).toEqual(arr(str('a'), str('b')));
  });

  test('removeField keeps the other fields and refuses _id', () => {
    const next = removeField(user, ['address', 'street']);
    expect(keys(getValue(next, ['address']))).toEqual(['city', 'zip']);
    expect(getValue(removeField(user, ['tags', 0]), ['tags'])).toEqual(arr(str('b')));
    expect(() => removeField(user, ['_id'])).toThrow(DocEditError);
    expect(() => removeField(user, ['missing'])).toThrow(DocEditError);
  });

  test('edit preserves untouched Int64', () => {
    const text = formatEditable(setValue(user, ['name'], str('Grace')));
    expect(text).toContain('"credits": {"$numberLong": "5"}');
    expect(text).toContain('"name": "Grace"');
  });

  test('uniqueFieldKey skips taken keys', () => {
    expect(uniqueFieldKey(obj(['a', str('')]))).toBe('newField');
    expect(uniqueFieldKey(obj(['newField', str('')], ['newField1', str('')]))).toBe('newField2');
  });

  test('addFieldTarget', () => {
    expect(addFieldTarget(user, [])).toEqual({ kind: 'field', parentPath: [] });
    expect(addFieldTarget(user, ['address'])).toEqual({ kind: 'field', parentPath: ['address'] });
    expect(addFieldTarget(user, ['address', 'city'])).toEqual({
      kind: 'field',
      parentPath: ['address'],
      afterKey: 'city',
    });
    expect(addFieldTarget(user, ['tags'])).toEqual({ kind: 'item', arrayPath: ['tags'], index: 2 });
    expect(addFieldTarget(user, ['tags', 0])).toEqual({ kind: 'item', arrayPath: ['tags'], index: 1 });
  });
});

describe('formatEditable after an edit', () => {
  test('integral Double, Decimal128 and Date stay as they were', () => {
    const doc = obj(
      ['_id', oid],
      ['name', str('Ada')],
      ['score', { t: 'double', v: '5.0' }],
      ['price', { t: 'decimal128', v: '0.10' }],
      ['born', { t: 'date', v: '1815-12-10T00:00:00.000Z' }],
    );
    const text = formatEditable(setValue(doc, ['name'], str('Grace')));
    expect(text).toContain('"score": 5.0');
    expect(text).toContain('"price": {"$numberDecimal": "0.10"}');
    expect(text).toContain('"born": {"$date": "1815-12-10T00:00:00.000Z"}');
  });

  test('odd keys keep their order and spelling', () => {
    const doc = obj(['10', int32('1')], ['2', int32('2')], ['a.b', int32('3')], ['$x', int32('4')], ['', int32('5')], ['plain', int32('6')]);
    const oddKeys = ['10', '2', 'a.b', '$x', ''];
    expect(keys(setValue(doc, ['a.b'], str('x')))).toEqual([...oddKeys, 'plain']);
    expect(keys(setValue(doc, [''], str('x')))).toEqual([...oddKeys, 'plain']);
    expect(keys(renameField(doc, ['plain'], 'renamed'))).toEqual([...oddKeys, 'renamed']);
    const added = addField(doc, [], 'new', str('n'), '$x');
    expect(keys(added)).toEqual(['10', '2', 'a.b', '$x', 'new', '', 'plain']);
    expect(formatEditable(added)).toBe(
      '{\n  "10": 1,\n  "2": 2,\n  "a.b": 3,\n  "$x": 4,\n  "new": "n",\n  "": 5,\n  "plain": 6\n}',
    );
  });
});

describe('commitInlineEdit', () => {
  test('a value that parses is applied', () => {
    const result = commitInlineEdit(user, ['address', 'city'], 'value', 'city', {
      key: 'city',
      text: 'Paris',
      type: 'string',
    });
    expect(getValue(result.doc, ['address', 'city'])).toEqual(str('Paris'));
    expect(result.path).toEqual(['address', 'city']);
  });

  test('a new field is renamed and set in one step', () => {
    const withNew = addField(user, [], 'newField', str(''));
    const result = commitInlineEdit(withNew, ['newField'], 'field', 'newField', { key: 'age', text: '36', type: 'int32' });
    expect(getValue(result.doc, ['age'])).toEqual(int32('36'));
    expect(result.path).toEqual(['age']);
  });

  test('a value that does not parse throws and leaves the document alone', () => {
    expect(() =>
      commitInlineEdit(user, ['name'], 'value', 'name', { key: 'name', text: 'abc', type: 'int32' }),
    ).toThrow(DocEditError);
    expect(() =>
      commitInlineEdit(user, ['name'], 'rename', 'name', { key: 'credits', text: '', type: 'string' }),
    ).toThrow(/already/);
  });
});

describe('convertScalar', () => {
  test('convertScalar int32 range', () => {
    expect(convertScalar('2147483647', 'int32')).toEqual(int32('2147483647'));
    expect(convertScalar('-2147483648', 'int32')).toEqual(int32('-2147483648'));
    expect(convertScalar(' +42 ', 'int32')).toEqual(int32('42'));
    expect(() => convertScalar('2147483648', 'int32')).toThrow(DocEditError);
    expect(() => convertScalar('1.5', 'int32')).toThrow(DocEditError);
    expect(() => convertScalar('', 'int32')).toThrow(DocEditError);
  });

  test('int64 keeps every digit', () => {
    expect(convertScalar('9223372036854775807', 'int64')).toEqual({ t: 'int64', v: '9223372036854775807' });
    expect(() => convertScalar('9223372036854775808', 'int64')).toThrow(DocEditError);
  });

  test('convertScalar objectId validates hex', () => {
    expect(convertScalar('507F1F77BCF86CD799439011', 'objectId')).toEqual(oid);
    expect(() => convertScalar('507f1f77bcf86cd79943901', 'objectId')).toThrow(DocEditError);
    expect(() => convertScalar('507f1f77bcf86cd79943901z', 'objectId')).toThrow(DocEditError);
  });

  test('date is normalised to UTC milliseconds', () => {
    expect(convertScalar('2024-01-02', 'date')).toEqual({ t: 'date', v: '2024-01-02T00:00:00.000Z' });
    expect(convertScalar('2024-01-02T03:04:05Z', 'date')).toEqual({ t: 'date', v: '2024-01-02T03:04:05.000Z' });
    expect(convertScalar('2024-01-02T03:04:05+01:00', 'date')).toEqual({
      t: 'date',
      v: '2024-01-02T02:04:05.000Z',
    });
    expect(convertScalar('0050-03-04', 'date')).toEqual({ t: 'date', v: '0050-03-04T00:00:00.000Z' });
    expect(convertScalar('0099-12-31T23:59:59Z', 'date')).toEqual({ t: 'date', v: '0099-12-31T23:59:59.000Z' });
    expect(() => convertScalar('2024-13-02', 'date')).toThrow(DocEditError);
    expect(() => convertScalar('2023-02-29', 'date')).toThrow(DocEditError);
    expect(() => convertScalar('yesterday', 'date')).toThrow(DocEditError);
  });

  test('double keeps a decimal point or exponent', () => {
    expect(convertScalar('5', 'double')).toEqual({ t: 'double', v: '5.0' });
    expect(convertScalar('1.25', 'double')).toEqual({ t: 'double', v: '1.25' });
    expect(convertScalar('1e21', 'double')).toEqual({ t: 'double', v: '1e21' });
    expect(convertScalar('-Infinity', 'double')).toEqual({ t: 'double', v: '-Infinity' });
    expect(convertScalar('NaN', 'double')).toEqual({ t: 'double', v: 'NaN' });
    expect(() => convertScalar('1e999', 'double')).toThrow(DocEditError);
    expect(() => convertScalar('abc', 'double')).toThrow(DocEditError);
  });

  test('decimal128 checks the pattern and keeps the text', () => {
    expect(convertScalar('0.10', 'decimal128')).toEqual({ t: 'decimal128', v: '0.10' });
    expect(convertScalar('-1.5E+3', 'decimal128')).toEqual({ t: 'decimal128', v: '-1.5E+3' });
    expect(convertScalar('Infinity', 'decimal128')).toEqual({ t: 'decimal128', v: 'Infinity' });
    expect(() => convertScalar('1.2.3', 'decimal128')).toThrow(DocEditError);
  });

  test('string, bool and null', () => {
    expect(convertScalar(' padded ', 'string')).toEqual(str(' padded '));
    expect(convertScalar('true', 'bool')).toEqual({ t: 'bool', v: true });
    expect(convertScalar('FALSE', 'bool')).toEqual({ t: 'bool', v: false });
    expect(() => convertScalar('yes', 'bool')).toThrow(DocEditError);
    expect(convertScalar('anything', 'null')).toEqual({ t: 'null' });
  });

  test('scalarTypeOf and scalarText round-trip', () => {
    const values: DocValue[] = [
      str('x'),
      int32('1'),
      { t: 'int64', v: '5' },
      { t: 'double', v: '1.5' },
      { t: 'decimal128', v: '0.1' },
      { t: 'bool', v: true },
      { t: 'null' },
      oid,
      { t: 'date', v: '2024-01-02T00:00:00.000Z' },
    ];
    for (const v of values) {
      const type = scalarTypeOf(v);
      expect(type).toBeDefined();
      expect(convertScalar(scalarText(v), type!)).toEqual(v);
    }
    expect(scalarTypeOf({ t: 'binary', subtype: 0, base64: '' })).toBeUndefined();
    expect(scalarTypeOf(obj())).toBeUndefined();
  });
});

test('rowEditCapabilities', () => {
  expect(rowEditCapabilities(user, [])).toEqual({ editValue: false, rename: false, remove: false, duplicate: false });
  expect(rowEditCapabilities(user, ['_id'])).toEqual({ editValue: false, rename: false, remove: false, duplicate: false });
  expect(rowEditCapabilities(user, ['name'])).toEqual({ editValue: true, rename: true, remove: true, duplicate: false });
  expect(rowEditCapabilities(user, ['address'])).toEqual({ editValue: false, rename: true, remove: true, duplicate: false });
  expect(rowEditCapabilities(user, ['tags', 1])).toEqual({ editValue: true, rename: false, remove: true, duplicate: true });
  const nested = obj(['_id', oid], ['ref', obj(['_id', str('x')])]);
  expect(rowEditCapabilities(nested, ['ref', '_id'])).toEqual({ editValue: true, rename: true, remove: true, duplicate: false });
});

test('newDocumentTemplate', () => {
  expect(newDocumentTemplate()).toBe('{\n  \n}');
});
