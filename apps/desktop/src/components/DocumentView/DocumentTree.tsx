import type { CSSProperties, MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { previewText, typeLabel, type TreeRow } from '../../lib/document/docTree';

export const DOCUMENT_ROW_HEIGHT = 28;
const INDENT_PX = 16;

const TONES: Record<string, string> = {
  String: '--syntax-string',
  Int32: '--syntax-constant',
  Int64: '--syntax-constant',
  Double: '--syntax-constant',
  Decimal128: '--syntax-constant',
  ObjectId: '--syntax-keyword',
  Date: '--syntax-function',
  Timestamp: '--syntax-function',
  Boolean: '--syntax-type',
  Null: '--syntax-type',
  Undefined: '--syntax-type',
  MinKey: '--syntax-type',
  MaxKey: '--syntax-type',
  Object: '--muted-foreground',
  Array: '--muted-foreground',
};

export function toneVar(label: string): string {
  return `var(${TONES[label] ?? '--syntax-operator'})`;
}

export function TypeBadge({ label }: { label: string }) {
  const tone = toneVar(label);
  const style: CSSProperties = {
    color: tone,
    backgroundColor: `color-mix(in oklch, ${tone} 12%, transparent)`,
    borderColor: `color-mix(in oklch, ${tone} 30%, transparent)`,
  };
  return (
    <span
      className="shrink-0 px-1.5 rounded border text-[10px] leading-4 font-medium font-sans tabular-nums"
      style={style}
    >
      {label}
    </span>
  );
}

interface DocumentTreeRowProps {
  row: TreeRow;
  selected: boolean;
  onToggle: (row: TreeRow) => void;
  onSelect: (row: TreeRow, event: MouseEvent) => void;
}

/** One line of the document tree: key, type badge and a one-line preview of the value. */
export function DocumentTreeRow({ row, selected, onToggle, onSelect }: DocumentTreeRowProps) {
  const label = typeLabel(row.value);
  const isDocument = row.depth === 0;
  const preview = previewText(row.value);
  const container = row.value.t === 'object' || row.value.t === 'array';
  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={selected}
      onClick={(event) => onSelect(row, event)}
      onDoubleClick={() => row.expandable && onToggle(row)}
      style={{ height: DOCUMENT_ROW_HEIGHT, paddingLeft: 8 + row.depth * INDENT_PX }}
      className={`flex items-center gap-1.5 pr-3 font-mono text-xs cursor-default select-none transition-colors ${
        isDocument ? 'border-t border-border/60 first:border-t-0' : ''
      } ${
        selected
          ? isDocument
            ? 'bg-primary/20 text-foreground'
            : 'bg-primary/10'
          : 'hover:bg-accent/50'
      }`}
    >
      {row.expandable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? 'Collapse' : 'Expand'}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row);
          }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 ${row.expanded ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <span className="shrink-0 w-4" />
      )}
      <span
        className={`shrink-0 max-w-[40%] truncate ${
          isDocument ? 'font-semibold text-foreground' : 'text-[var(--syntax-function)]'
        }`}
        title={row.key}
      >
        {row.key}
      </span>
      {!isDocument && <span className="shrink-0 text-muted-foreground">:</span>}
      <TypeBadge label={label} />
      <span
        className={`min-w-0 truncate ${container ? 'text-muted-foreground' : ''}`}
        style={container ? undefined : { color: toneVar(label) }}
        title={container ? undefined : preview}
      >
        {preview}
      </span>
    </div>
  );
}
