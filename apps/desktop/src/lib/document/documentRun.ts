import type { QueryErrorPosition, SqlRange } from '@db/shared';
import { hasRunnableSelection, statementAt, type RunMode, type RunSelection } from '../runTarget';

export interface DocumentRunTarget {
  text: string;
  /** Where `text` starts in the editor, to place an error position back in the script. */
  offset: number;
}

export function documentRunTarget(input: {
  doc: string;
  selection: RunSelection;
  ranges: SqlRange[] | null;
  mode: RunMode;
}): DocumentRunTarget | null {
  const { doc, selection, ranges, mode } = input;
  if (doc.trim() === '') return null;
  if (mode === 'all') return { text: doc, offset: 0 };
  if (hasRunnableSelection(doc, selection)) {
    return { text: doc.slice(selection.from, selection.to), offset: selection.from };
  }
  if (ranges === null) return { text: doc, offset: 0 };
  if (ranges.length === 0) return null;
  const owner = statementAt(ranges, selection.from);
  return { text: doc.slice(owner.start, owner.end), offset: owner.start };
}

/** The editor offset of a 1-based `position` inside `text`, which starts at `base` in the editor. */
export function errorOffset(text: string, base: number, position: QueryErrorPosition): number {
  const lines = text.split('\n');
  const index = Math.min(Math.max(position.line - 1, 0), lines.length - 1);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += lines[i].length + 1;
  const line = lines[index].replace(/\r$/, '');
  const column = Math.min(Math.max((position.column ?? 1) - 1, 0), line.length);
  return base + offset + column;
}
