import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { DocValue } from '@db/shared';
import { flattenTree, treeKey, type TreeRow } from '../../lib/document/docTree';
import { useGridWindow } from '../TableView/useGridWindow';
import { DOCUMENT_ROW_HEIGHT, DocumentTreeRow } from './DocumentTree';

const NO_COLUMNS = [0];

interface DocumentListProps {
  documents: DocValue[];
  /** Indices into `documents`. */
  selected: readonly number[];
  onSelect: (docIndex: number, toggle: boolean) => void;
  'aria-label'?: string;
}

/**
 * The documents as an expandable tree. Like the data grid, only rows near the viewport are
 * mounted. Mount it with a new `key` when the query changes so expansion starts over; a refresh
 * of the same page keeps it.
 */
export function DocumentList({ documents, selected, onSelect, 'aria-label': ariaLabel }: DocumentListProps) {
  const portRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const rows = useMemo(() => flattenTree(documents, expanded), [documents, expanded]);
  const range = useGridWindow({
    portRef,
    rowCount: rows.length,
    offsets: NO_COLUMNS,
    leadingWidth: 0,
    rowHeight: DOCUMENT_ROW_HEIGHT,
    headerHeight: 0,
  });
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (row: TreeRow) => {
    const key = treeKey(row.docIndex, row.path);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const select = (row: TreeRow, event: MouseEvent) => onSelect(row.docIndex, event.metaKey || event.ctrlKey);

  const start = Math.min(range.rowStart, rows.length);
  const end = Math.min(range.rowEnd, rows.length);
  return (
    <div ref={portRef} className="flex-1 min-h-0 overflow-auto" role="tree" aria-multiselectable aria-label={ariaLabel}>
      <div style={{ height: rows.length * DOCUMENT_ROW_HEIGHT }}>
        <div style={{ height: start * DOCUMENT_ROW_HEIGHT }} />
        {rows.slice(start, end).map((row) => (
          <DocumentTreeRow
            key={treeKey(row.docIndex, row.path)}
            row={row}
            selected={selectedSet.has(row.docIndex)}
            onToggle={toggle}
            onSelect={select}
          />
        ))}
      </div>
    </div>
  );
}
