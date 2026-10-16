/** Next/previous tab id, wrapping around. Null with fewer than 2 tabs or an unknown active tab. */
export function adjacentTabId(
  tabIds: string[],
  activeId: string,
  delta: 1 | -1
): string | null {
  if (tabIds.length < 2) return null;
  const index = tabIds.indexOf(activeId);
  if (index < 0) return null;
  return tabIds[(index + delta + tabIds.length) % tabIds.length];
}

/** 1-based tab selection; 9 means the last tab (browser convention). */
export function nthTabId(tabIds: string[], n: number): string | null {
  if (tabIds.length === 0 || n < 1 || n > 9) return null;
  if (n === 9) return tabIds[tabIds.length - 1];
  return tabIds[n - 1] ?? null;
}
