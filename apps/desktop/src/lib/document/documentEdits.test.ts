import { describe, expect, test } from 'bun:test';
import type { DocValue } from '@db/shared';
import {
  cloneText,
  deletePrompt,
  dirtyIndices,
  idFilter,
  isConflictError,
  recordEdit,
  offPageEditCount,
  retainTabEdits,
  withEdits,
  type DocumentEdits,
} from './documentEdits';

const str = (v: string): DocValue => ({ t: 'string', v });
const obj = (...entries: [string, DocValue][]): DocValue => ({ t: 'object', entries });
const oid = (v: string): DocValue => ({ t: 'objectId', v });

const a = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Ada')]);
const b = obj(['_id', oid('507f1f77bcf86cd799439012')], ['name', str('Bob')]);
const keyA = '{"$oid": "507f1f77bcf86cd799439011"}';

describe('document edits', () => {
  test('recordEdit keeps the first loaded original', () => {
    const renamed = obj(['_id', a.t === 'object' ? a.entries[0][1] : str('')], ['name', str('Grace')]);
    let edits: DocumentEdits = recordEdit({}, keyA, a, renamed);
    const again = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Hopper')]);
    edits = recordEdit(edits, keyA, renamed, again);
    expect(edits[keyA]).toEqual({ original: a, edited: again });
  });

  test('an edit back to the original is no longer dirty', () => {
    const changed = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Grace')]);
    const edits = recordEdit({}, keyA, a, changed);
    expect(recordEdit(edits, keyA, changed, a)).toEqual({});
  });

  test('withEdits shows edited documents and dirtyIndices finds them', () => {
    const changed = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Grace')]);
    const edits = recordEdit({}, keyA, a, changed);
    expect(withEdits([b, a], edits)).toEqual([b, changed]);
    expect(dirtyIndices([b, a], edits)).toEqual([1]);
    expect(withEdits([b], edits)).toEqual([b]);
  });

  test('reload keeps dirty edits for documents off the page', () => {
    const changed = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Grace')]);
    const edits = recordEdit({}, keyA, a, changed);
    // A sorted page that shifted after a save no longer shows A.
    expect(withEdits([b], edits)).toEqual([b]);
    expect(dirtyIndices([b], edits)).toEqual([]);
    expect(offPageEditCount([b], edits)).toBe(1);
    expect(offPageEditCount([b, a], edits)).toBe(0);
    expect(edits[keyA]).toEqual({ original: a, edited: changed });
  });

  test('retainTabEdits drops the edits of closed tabs', () => {
    const changed = obj(['_id', oid('507f1f77bcf86cd799439011')], ['name', str('Grace')]);
    const byTab = { t1: recordEdit({}, keyA, a, changed), t2: {} };
    expect(retainTabEdits(byTab, ['t1', 't2', 't3'])).toBe(byTab);
    expect(retainTabEdits(byTab, ['t1'])).toEqual({ t1: byTab.t1 });
  });

  test('conflict errors are recognised by the server message', () => {
    expect(
      isConflictError('The document changed on the server after it was loaded. Reload it and apply your edit again.'),
    ).toBe(true);
    expect(isConflictError('_id cannot be changed. Insert a copy and delete the original instead.')).toBe(false);
  });

  test('idFilter and cloneText', () => {
    expect(idFilter(oid('507f1f77bcf86cd799439011'))).toBe(`{"_id": ${keyA}}`);
    expect(cloneText(a)).toBe('{\n  "name": "Ada"\n}');
    expect(cloneText(obj(['_id', oid('507f1f77bcf86cd799439011')]))).toBe('{\n  \n}');
  });

  test('deletePrompt names the count', () => {
    expect(deletePrompt(1)).toBe('Delete 1 document?');
    expect(deletePrompt(3)).toBe('Delete 3 documents?');
  });
});
