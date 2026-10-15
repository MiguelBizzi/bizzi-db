import type { SqlRange } from '@db/shared';

/** `auto` runs the selection, else the statement under the caret; `all` runs the whole script. */
export type RunMode = 'auto' | 'all';

export interface RunSelection {
  from: number;
  to: number;
}

export interface RunTarget {
  kind: 'selection' | 'statement' | 'all';
  sql: string;
}

export function hasRunnableSelection(doc: string, selection: RunSelection): boolean {
  return doc.slice(selection.from, selection.to).trim() !== '';
}

/**
 * Decide which SQL a run should send. `ranges` are the statement ranges from the
 * backend; when they are unknown (`null`) a caret run falls back to the whole script.
 */
export function resolveRunTarget(input: {
  doc: string;
  selection: RunSelection;
  ranges: SqlRange[] | null;
  mode: RunMode;
}): RunTarget | null {
  const { doc, selection, ranges, mode } = input;
  if (doc.trim() === '') return null;

  if (mode === 'all') return { kind: 'all', sql: doc };

  if (hasRunnableSelection(doc, selection)) {
    return { kind: 'selection', sql: doc.slice(selection.from, selection.to) };
  }

  if (ranges === null) return { kind: 'all', sql: doc };
  if (ranges.length === 0) return null;

  // A statement owns everything up to the next one, so a caret in the gap after a
  // statement (its `;`, blank lines) still runs it.
  const caret = selection.from;
  const owner = [...ranges].reverse().find((range) => range.start <= caret) ?? ranges[0];
  return { kind: 'statement', sql: doc.slice(owner.start, owner.end) };
}
