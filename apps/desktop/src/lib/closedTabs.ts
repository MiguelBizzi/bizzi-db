import type { WorkspaceTab } from '../types';

export interface ClosedTab {
  tab: WorkspaceTab;
  paneId: string;
  index: number;
}

/** Appends `entries` (newest last), dropping the oldest beyond `max`. Never mutates its inputs. */
export function pushClosed(
  stack: ClosedTab[],
  entries: ClosedTab[],
  max = 20
): ClosedTab[] {
  const next = [...stack, ...entries];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Walks from the newest entry, discarding entries that fail `isValid`, and returns the first
 * valid one with the remaining stack. Returns null when no entry is valid.
 */
export function popReopenable(
  stack: ClosedTab[],
  isValid: (tab: WorkspaceTab) => boolean
): { entry: ClosedTab; rest: ClosedTab[] } | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (isValid(stack[i].tab)) {
      return { entry: stack[i], rest: stack.slice(0, i) };
    }
  }
  return null;
}
