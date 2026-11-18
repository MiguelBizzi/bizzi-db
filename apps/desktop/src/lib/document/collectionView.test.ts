import { describe, expect, test } from 'bun:test';
import type { DocumentPage } from '@db/shared';
import {
  canPageForward,
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
    expect(selectDocument([1, 2], 4, false)).toEqual([4]);
  });

  test('a modifier click toggles it in the selection', () => {
    expect(selectDocument([1], 3, true)).toEqual([1, 3]);
    expect(selectDocument([1, 3], 1, true)).toEqual([3]);
  });
});

describe('page range', () => {
  test('labels the shown range and the total', () => {
    expect(pageRangeLabel(0, 50, 1234)).toBe('1–50 of 1,234');
    expect(pageRangeLabel(50, 20, null)).toBe('51–70 of many');
    expect(pageRangeLabel(0, 0, 0)).toBe('No documents');
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
