import { describe, expect, test } from 'bun:test';
import { captionButtons, navbarEndGroupClass, navbarPadding, resizeEdges, resizeHandlesEnabled } from './windowChrome';

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

describe('captionButtons on Linux', () => {
  test('linux restore label', () => {
    expect(captionButtons(true, 'linux')[1]).toEqual({ action: 'restore', label: 'Restore' });
    expect(captionButtons(true, 'windows')[1].label).toBe('Restore Down');
  });
});

describe('resizeEdges', () => {
  test('eight resize edges', () => {
    const edges = resizeEdges({ maximized: false, fullscreen: false });
    expect(edges.map((e) => e.direction)).toEqual([
      'North', 'South', 'East', 'West', 'NorthEast', 'NorthWest', 'SouthEast', 'SouthWest',
    ]);
    expect(edges.map((e) => e.cursor)).toEqual([
      'ns-resize', 'ns-resize', 'ew-resize', 'ew-resize',
      'nesw-resize', 'nwse-resize', 'nwse-resize', 'nesw-resize',
    ]);
  });

  test('no handles while maximized or full screen', () => {
    expect(resizeEdges({ maximized: true, fullscreen: false })).toEqual([]);
    expect(resizeEdges({ maximized: false, fullscreen: true })).toEqual([]);
  });
});

describe('navbarPadding', () => {
  test('linux navbar padding', () => {
    expect(navbarPadding('linux')).toBe('pl-4 pr-0');
    expect(navbarPadding('macos')).toBe('pl-24 pr-4');
  });

  test('leaves room for traffic lights on macOS and none for caption buttons on Windows', () => {
    expect(navbarPadding('macos')).toBe('pl-24 pr-4');
    expect(navbarPadding('windows')).toBe('pl-4 pr-0');
  });
});

describe('resizeHandlesEnabled', () => {
  test('only inside Tauri on Linux', () => {
    expect(resizeHandlesEnabled('linux', true)).toBe(true);
    expect(resizeHandlesEnabled('linux', false)).toBe(false);
    expect(resizeHandlesEnabled('macos', true)).toBe(false);
    expect(resizeHandlesEnabled('windows', true)).toBe(false);
  });
});

describe('navbarEndGroupClass', () => {
  test('groups the toolbar with the caption buttons on Windows so the header keeps the macOS flex children', () => {
    expect(navbarEndGroupClass('windows')).toBe('flex items-center h-full gap-2');
  });

  test('adds no wrapper on macOS and groups on Linux', () => {
    expect(navbarEndGroupClass('macos')).toBeNull();
    expect(navbarEndGroupClass('linux')).toBe('flex items-center h-full gap-2');
  });
});
