import { describe, expect, test } from 'bun:test';
import type { QueryErrorCategory, QueryErrorInfo } from '../types';
import { categoryLabel, errorExcerpt, errorFacts } from './queryError';

describe('categoryLabel', () => {
  test('names every category', () => {
    const expected: Record<QueryErrorCategory, string> = {
      syntax: 'Syntax error',
      reference: 'Reference error',
      constraint: 'Constraint violation',
      permission: 'Permission denied',
      connection: 'Connection error',
      timeout: 'Timeout',
      other: 'Error',
    };
    for (const [category, label] of Object.entries(expected)) {
      expect(categoryLabel(category as QueryErrorCategory)).toBe(label);
    }
  });
});

describe('errorExcerpt', () => {
  test('returns the offending line and caret column', () => {
    expect(errorExcerpt('SELECT 1\nFROM nope', { offset: 15, line: 2, column: 6 })).toEqual({
      lineNumber: 2,
      text: 'FROM nope',
      caretColumn: 6,
    });
  });

  test('strips carriage returns from CRLF queries', () => {
    expect(errorExcerpt('SELECT 1\r\nFROM nope', { offset: 16, line: 2, column: 6 })).toEqual({
      lineNumber: 2,
      text: 'FROM nope',
      caretColumn: 6,
    });
  });

  test('is null without a position or when the line does not exist', () => {
    expect(errorExcerpt('SELECT 1', undefined)).toBeNull();
    expect(errorExcerpt('SELECT 1', { offset: 5, line: 3, column: 1 })).toBeNull();
  });

  test('windows a long line around the caret', () => {
    const line = 'a'.repeat(2499) + 'X' + 'b'.repeat(2500);
    const excerpt = errorExcerpt(line, { offset: 2500, line: 1, column: 2500 });
    expect(excerpt).not.toBeNull();
    const { text, caretColumn } = excerpt!;
    expect(text.length).toBeLessThanOrEqual(122);
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    expect(text[caretColumn - 1]).toBe('X');
  });

  test('does not add a leading ellipsis near the start of a long line', () => {
    const line = 'SELECT ' + 'x'.repeat(5000);
    const excerpt = errorExcerpt(line, { offset: 3, line: 1, column: 3 })!;
    expect(excerpt.text.startsWith('…')).toBe(false);
    expect(excerpt.text.endsWith('…')).toBe(true);
    expect(excerpt.caretColumn).toBe(3);
  });
});

describe('errorFacts', () => {
  test('lists present facts in a fixed order and skips empty ones', () => {
    const info: QueryErrorInfo = {
      category: 'constraint',
      message: 'duplicate key',
      hint: 'a hint',
      schema: 'public',
      table: 'users',
      column: 'email',
      constraint: 'users_email_key',
      detail: 'Key (email)=(a) already exists.',
    };
    expect(errorFacts(info)).toEqual([
      { label: 'Detail', value: 'Key (email)=(a) already exists.' },
      { label: 'Constraint', value: 'users_email_key' },
      { label: 'Table', value: 'users' },
      { label: 'Column', value: 'email' },
      { label: 'Schema', value: 'public' },
    ]);
    expect(errorFacts({ category: 'other', message: 'x', detail: '' })).toEqual([]);
  });
});
