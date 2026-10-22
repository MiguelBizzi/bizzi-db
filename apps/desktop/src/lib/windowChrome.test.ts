import { describe, expect, test } from 'bun:test';
import { captionButtons, navbarEndGroupClass, navbarPadding } from './windowChrome';

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

describe('navbarEndGroupClass', () => {
  test('groups the toolbar with the caption buttons on Windows so the header keeps the macOS flex children', () => {
    expect(navbarEndGroupClass('windows')).toBe('flex items-center h-full gap-2');
  });

  test('adds no wrapper elsewhere', () => {
    expect(navbarEndGroupClass('macos')).toBeNull();
    expect(navbarEndGroupClass('linux')).toBeNull();
  });
});
