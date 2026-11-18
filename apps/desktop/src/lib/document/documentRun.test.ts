import { describe, expect, test } from 'bun:test';
import { documentRunTarget, errorOffset } from './documentRun';

const DOC = 'db.a.find()\n\ndb.b.find()';
const ranges = [
  { start: 0, end: 11 },
  { start: 13, end: 24 },
];

describe('documentRunTarget', () => {
  test('runs the statement under the caret, with its offset', () => {
    expect(documentRunTarget({ doc: DOC, selection: { from: 15, to: 15 }, ranges, mode: 'auto' })).toEqual({
      text: 'db.b.find()',
      offset: 13,
    });
  });

  test('a caret between statements runs the previous one', () => {
    expect(documentRunTarget({ doc: DOC, selection: { from: 12, to: 12 }, ranges, mode: 'auto' })).toEqual({
      text: 'db.a.find()',
      offset: 0,
    });
  });

  test('a selection runs exactly the selected text', () => {
    expect(documentRunTarget({ doc: DOC, selection: { from: 3, to: 6 }, ranges, mode: 'auto' })).toEqual({
      text: 'a.f',
      offset: 3,
    });
  });

  test('run all sends the whole script', () => {
    expect(documentRunTarget({ doc: DOC, selection: { from: 15, to: 15 }, ranges, mode: 'all' })).toEqual({
      text: DOC,
      offset: 0,
    });
  });

  test('unknown ranges fall back to the whole script; a blank script runs nothing', () => {
    expect(documentRunTarget({ doc: DOC, selection: { from: 0, to: 0 }, ranges: null, mode: 'auto' })?.text).toBe(DOC);
    expect(documentRunTarget({ doc: '  ', selection: { from: 0, to: 0 }, ranges: null, mode: 'auto' })).toBeNull();
  });
});

describe('errorOffset', () => {
  test('maps a 1-based line and column to an editor offset', () => {
    expect(errorOffset('ab\ncd', 0, { offset: 0, line: 2, column: 2 })).toBe(4);
  });

  test('adds the offset of the run text and handles CRLF', () => {
    expect(errorOffset('ab\r\ncd', 10, { offset: 0, line: 2, column: 1 })).toBe(14);
  });

  test('without a column the line start is used, and out-of-range values are clamped', () => {
    expect(errorOffset('ab\ncd', 0, { offset: 0, line: 2 })).toBe(3);
    expect(errorOffset('ab', 0, { offset: 0, line: 9, column: 9 })).toBe(2);
    expect(errorOffset('ab', 0, { offset: 0, line: 1, column: 99 })).toBe(2);
  });
});
