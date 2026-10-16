import { describe, expect, test } from 'bun:test';
import { EMPTY_CONTEXT, isTextInputTarget } from './context';

const SELECTOR = 'input, textarea, select, [contenteditable="true"], .cm-content';

describe('isTextInputTarget', () => {
  test('null is not a text input', () => {
    expect(isTextInputTarget(null)).toBe(false);
  });

  test('true when closest matches the text input selector', () => {
    const el = { closest: (selector: string) => (selector === SELECTOR ? {} : null) };
    expect(isTextInputTarget(el)).toBe(true);
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
