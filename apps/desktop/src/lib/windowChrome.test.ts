import { describe, expect, test } from 'bun:test';
import { captionButtons, navbarPadding } from './windowChrome';

describe('captionButtons', () => {
  test('offers maximize while the window is restored', () => {
    expect(captionButtons(false)).toEqual([
      { action: 'minimize', label: 'Minimize' },
      { action: 'maximize', label: 'Maximize' },
      { action: 'close', label: 'Close' },
    ]);
  });

  test('offers restore while the window is maximized', () => {
    expect(captionButtons(true)[1]).toEqual({ action: 'restore', label: 'Restore Down' });
  });
});

describe('navbarPadding', () => {
  test('leaves room for traffic lights on macOS and none for caption buttons on Windows', () => {
    expect(navbarPadding('macos')).toBe('pl-24 pr-4');
    expect(navbarPadding('windows')).toBe('pl-4 pr-0');
  });
});
