import { describe, expect, test } from 'bun:test';
import type { DocValue, DocumentPage } from '@db/shared';
import {
  canPageForward,
  documentSelectionKey,
  retainSelection,
  selectedIndices,
  insertFieldFilter,
  pageErrorResult,
  pageRangeLabel,
  selectDocument,
} from './collectionView';

describe('insertFieldFilter', () => {
  test('starts a filter when it is empty', () => {
    expect(insertFieldFilter('', 'address.city')).toEqual({ text: '{ "address.city": }', caret: 18 });
    expect(insertFieldFilter('  {}  ', 'age')).toEqual({ text: '{ "age": }', caret: 9 });
  });

  test('adds the field before the closing brace of an existing filter', () => {
    const { text, caret } = insertFieldFilter('{ age: 1 }', 'name');
    expect(text).toBe('{ age: 1, "name": }');
    expect(text.slice(caret)).toBe('}');
  });

  test('replaces text that is not a document', () => {
    expect(insertFieldFilter('age', 'name').text).toBe('{ "name": }');
  });

  test('escapes quotes in the path', () => {
    expect(insertFieldFilter('', 'a"b').text).toBe('{ "a\\"b": }');
  });
});

describe('selectDocument', () => {
  test('a plain click selects only that document', () => {
    expect(selectDocument(['a', 'b'], 'd', false)).toEqual(['d']);
  });

  test('a modifier click toggles it in the selection', () => {
    expect(selectDocument(['a'], 'c', true)).toEqual(['a', 'c']);
    expect(selectDocument(['a', 'c'], 'a', true)).toEqual(['c']);
  });
});

describe('document selection by id', () => {
  const doc = (id: number): DocValue => ({ t: 'object', entries: [['_id', { t: 'int32', v: String(id) }]] });
  const noId: DocValue = { t: 'object', entries: [['name', { t: 'string', v: 'x' }]] };

  test('selection survives a refresh by id', () => {
    const selected = [documentSelectionKey(doc(2))!];
    const refreshed = [doc(9), doc(1), doc(2)];
    expect(retainSelection(selected, refreshed)).toEqual(selected);
    expect(selectedIndices(selected, refreshed)).toEqual([2]);
  });

  test('selection drops ids missing from the new page', () => {
    const selected = [documentSelectionKey(doc(1))!, documentSelectionKey(doc(2))!];
    expect(retainSelection(selected, [doc(2), doc(3)])).toEqual([documentSelectionKey(doc(2))]);
  });

  test('documents without _id are not selectable', () => {
    expect(documentSelectionKey(noId)).toBeUndefined();
    expect(selectedIndices([documentSelectionKey(doc(1))!], [noId, doc(1)])).toEqual([1]);
  });

  test('keys tell apart ids of different types', () => {
    expect(documentSelectionKey(doc(1))).not.toBe(
      documentSelectionKey({ t: 'object', entries: [['_id', { t: 'int64', v: '1' }]] }),
    );
  });
});

describe('page range', () => {
  test('labels the shown range and the total', () => {
    expect(pageRangeLabel(0, 50, 1234)).toBe('1–50 of 1,234');
    expect(pageRangeLabel(50, 20, null)).toBe('51–70 of many');
    expect(pageRangeLabel(0, 0, 0)).toBe('No documents');
    expect(pageRangeLabel(50, 0, null)).toBe('No more documents');
  });

  test('goes forward while more documents exist', () => {
    expect(canPageForward(0, 50, 50, 120)).toBe(true);
    expect(canPageForward(100, 20, 50, 120)).toBe(false);
    expect(canPageForward(0, 50, 50, null)).toBe(true);
    expect(canPageForward(0, 12, 50, null)).toBe(false);
  });
});

describe('pageErrorResult', () => {
  const failed = (patch: Partial<DocumentPage>): DocumentPage => ({
    documents: [],
    executionTimeMs: 3,
    error: 'bad',
    ...patch,
  });

  test('is null for a page without an error', () => {
    expect(pageErrorResult(failed({ error: null }), { filter: '', projection: '', sort: '' })).toBeNull();
  });

  test('points the excerpt at the only input that has text', () => {
    const result = pageErrorResult(failed({}), { filter: '{ a: }', projection: '', sort: ' ' });
    expect(result?.query).toBe('{ a: }');
    expect(result?.error).toBe('bad');
  });

  test('shows no excerpt when several inputs have text', () => {
    const result = pageErrorResult(failed({}), { filter: '{a: 1}', projection: '{b: 1}', sort: '' });
    expect(result?.query).toBe('');
  });
});
