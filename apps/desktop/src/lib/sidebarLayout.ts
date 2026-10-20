export const SIDEBAR_WIDTH_KEY = 'sidebar-width';
export const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
export const DEFAULT_SIDEBAR_WIDTH = 288;
export const MIN_SIDEBAR_WIDTH = 260;
export const MAX_SIDEBAR_WIDTH = 480;
export const COLLAPSED_SIDEBAR_WIDTH = 48;

type ReadableStorage = Pick<Storage, 'getItem'> | undefined;
type WritableStorage = Pick<Storage, 'setItem'> | undefined;

// Out-of-range widths pin to the nearest bound: dragging past the minimum must
// never collapse the sidebar; only the toggle does that.
export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value)));
}

export function readSidebarWidth(storage: ReadableStorage): number {
  try {
    const raw = storage?.getItem(SIDEBAR_WIDTH_KEY);
    if (raw == null || raw.trim() === '') return DEFAULT_SIDEBAR_WIDTH;
    return clampSidebarWidth(Number(raw));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

// Storage can be unavailable (private windows, blocked site data); the layout
// still applies for the session.
export function writeSidebarWidth(storage: WritableStorage, value: number): void {
  try {
    storage?.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(value)));
  } catch {
    // see above
  }
}

export function readSidebarCollapsed(storage: ReadableStorage): boolean {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage: WritableStorage, collapsed: boolean): void {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // see writeSidebarWidth
  }
}
