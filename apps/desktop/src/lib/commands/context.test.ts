import { describe, expect, test } from 'bun:test';
import { EMPTY_CONTEXT, isTextInputTarget, TEXT_INPUT_SELECTOR } from './context';

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];
const SELECTOR =
  'input' +
  NON_TEXT_INPUT_TYPES.map((type) => `:not([type=${type}])`).join('') +
  ', textarea, select, [contenteditable="true"], .cm-content';

describe('TEXT_INPUT_SELECTOR', () => {
  test('matches only elements that accept text', () => {
    expect(TEXT_INPUT_SELECTOR).toBe(SELECTOR);
  });

  test('excludes checkboxes and radios, so a focused row checkbox is not typing', () => {
    expect(TEXT_INPUT_SELECTOR).toContain(':not([type=checkbox])');
    expect(TEXT_INPUT_SELECTOR).toContain(':not([type=radio])');
  });

  test('still covers textareas, selects, contenteditable and the SQL editor', () => {
    const parts = TEXT_INPUT_SELECTOR.split(', ');
    expect(parts).toContain('textarea');
    expect(parts).toContain('select');
    expect(parts).toContain('[contenteditable="true"]');
    expect(parts).toContain('.cm-content');
    expect(parts.filter((part) => part === 'input')).toHaveLength(0);
  });
});

describe('isTextInputTarget', () => {
  test('null is not a text input', () => {
    expect(isTextInputTarget(null)).toBe(false);
  });

  test('true when closest matches the text input selector', () => {
    const el = { closest: (selector: string) => (selector === SELECTOR ? {} : null) };
    expect(isTextInputTarget(el)).toBe(true);
  });

  test('false when the element only matches a bare input selector (e.g. a checkbox)', () => {
    const checkbox = { closest: (selector: string) => (selector === 'input' ? {} : null) };
    expect(isTextInputTarget(checkbox)).toBe(false);
  });

  test('false when closest returns null', () => {
    expect(isTextInputTarget({ closest: () => null })).toBe(false);
  });
});

describe('EMPTY_CONTEXT', () => {
  test('is all zeros, false and null', () => {
    expect(EMPTY_CONTEXT).toEqual({
      activeTabType: null,
      tabCount: 0,
      paneTabCount: 0,
      selectedRowCount: 0,
      pendingCount: 0,
      connectionOpen: false,
      modalOpen: false,
      textInputFocused: false,
      sqlSelectionPresent: false,
      sqlResultPresent: false,
      closedTabCount: 0,
    });
  });
});
