import type { Platform } from './commands/accelerator';

export type CaptionAction = 'minimize' | 'maximize' | 'restore' | 'close';

export function captionButtons(maximized: boolean, platform?: Platform): { action: CaptionAction; label: string }[] {
  return [
    { action: 'minimize', label: 'Minimize' },
    maximized
      ? { action: 'restore', label: platform === 'linux' ? 'Restore' : 'Restore Down' }
      : { action: 'maximize', label: 'Maximize' },
    { action: 'close', label: 'Close' },
  ];
}

/** macOS reserves the left edge for traffic lights; Windows caption buttons sit flush against the right edge. */
export function navbarPadding(platform: Platform): string {
  if (platform === 'windows') return 'pl-4 pr-0';
  return platform === 'linux' ? 'pl-4 pr-2' : 'pl-24 pr-4';
}

/**
 * Class of the wrapper around the navbar's right toolbar and the caption buttons, or `null`
 * for no wrapper. The header is `justify-between`, so the caption buttons as a separate flex
 * child would shift the palette off centre and float the toolbar mid-bar.
 */
export function navbarEndGroupClass(platform: Platform): string | null {
  return platform === 'macos' ? null : 'flex items-center h-full gap-2';
}

// Not exported by @tauri-apps/api 2.2.0; same union as its `startResizeDragging` parameter.
export type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

const EDGE_BASE = 'z-50 fixed';

const EDGES: { direction: ResizeDirection; cursor: string; className: string }[] = [
  { direction: 'North', cursor: 'ns-resize', className: `${EDGE_BASE} top-0 left-2 right-2 h-1` },
  { direction: 'South', cursor: 'ns-resize', className: `${EDGE_BASE} bottom-0 left-2 right-2 h-1` },
  { direction: 'East', cursor: 'ew-resize', className: `${EDGE_BASE} right-0 top-2 bottom-2 w-1` },
  { direction: 'West', cursor: 'ew-resize', className: `${EDGE_BASE} left-0 top-2 bottom-2 w-1` },
  { direction: 'NorthEast', cursor: 'nesw-resize', className: `${EDGE_BASE} top-0 right-0 h-2 w-2` },
  { direction: 'NorthWest', cursor: 'nwse-resize', className: `${EDGE_BASE} top-0 left-0 h-2 w-2` },
  { direction: 'SouthEast', cursor: 'nwse-resize', className: `${EDGE_BASE} bottom-0 right-0 h-2 w-2` },
  { direction: 'SouthWest', cursor: 'nesw-resize', className: `${EDGE_BASE} bottom-0 left-0 h-2 w-2` },
];

/** Handles over a maximized or full-screen window would steal clicks from the close button and scrollbars at the screen edge. */
export function resizeEdges(state: {
  maximized: boolean;
  fullscreen: boolean;
}): { direction: ResizeDirection; cursor: string; className: string }[] {
  return state.maximized || state.fullscreen ? [] : EDGES;
}
