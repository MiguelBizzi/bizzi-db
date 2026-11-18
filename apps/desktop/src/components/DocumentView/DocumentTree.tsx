import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ChevronRight, Loader2, Undo2 } from 'lucide-react';
import { SCALAR_TYPES, type ScalarType } from '../../lib/document/docEdit';
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

export interface InlineEditValues {
  key: string;
  text: string;
  type: ScalarType;
}

export interface InlineEditorSpec {
  /** `rename` edits only the key, `value` only the value, `field` both. */
  mode: 'rename' | 'value' | 'field';
  initial: InlineEditValues;
}

interface InlineEditorProps extends InlineEditorSpec {
  /** Returns an error message to keep the editor open, or `null` once applied. Blur commits too. */
  onCommit: (values: InlineEditValues) => string | null;
  onCancel: () => void;
}

const INPUT =
  'min-w-0 h-5 px-1.5 bg-background border rounded text-xs font-mono text-foreground outline-none focus:border-primary';

function InlineEditor({ mode, initial, onCommit, onCancel }: InlineEditorProps) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  const patch = (next: Partial<InlineEditValues>) => {
    setError(null);
    setValues((prev) => ({ ...prev, ...next }));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // The tree's own Enter starts an edit; keys typed here belong to the editor.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      setError(onCommit(values));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const border = error ? 'border-rose-500' : 'border-border';
  return (
    <div
      ref={rootRef}
      className="flex items-center gap-1.5 min-w-0 flex-1"
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        // Moving between the key, type and value controls stays inside the editor. Leaving it
        // (for example to click Save) commits, and a value that does not parse keeps its error.
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setError(onCommit(values));
      }}
    >
      {mode !== 'value' && (
        <input
          ref={firstRef}
          aria-label="Field name"
          value={values.key}
          onChange={(event) => patch({ key: event.target.value })}
          spellCheck={false}
          className={`${INPUT} ${border} w-32 text-[var(--syntax-function)]`}
        />
      )}
      {mode === 'field' && <span className="shrink-0 text-muted-foreground">:</span>}
      {mode !== 'rename' && (
        <>
          <select
            aria-label="Value type"
            value={values.type}
            onChange={(event) => patch({ type: event.target.value as ScalarType })}
            className={`${INPUT} ${border} shrink-0 font-sans text-[11px]`}
          >
            {SCALAR_TYPES.map(({ type, label }) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          <input
            ref={mode === 'value' ? firstRef : undefined}
            aria-label="Value"
            value={values.type === 'null' ? '' : values.text}
            disabled={values.type === 'null'}
            placeholder={values.type === 'null' ? 'null' : undefined}
            onChange={(event) => patch({ text: event.target.value })}
            spellCheck={false}
            className={`${INPUT} ${border} flex-1`}
          />
        </>
      )}
      {error && (
        <span role="alert" className="shrink min-w-0 truncate text-[11px] font-sans text-rose-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

interface DocumentTreeRowProps {
  row: TreeRow;
  selected: boolean;
  /** The row Enter edits. */
  active: boolean;
  /** Only on a document's own row: it has unsaved tree edits. */
  dirty?: boolean;
  saving?: boolean;
  editor?: InlineEditorSpec;
  onToggle: (row: TreeRow) => void;
  onSelect: (row: TreeRow, event: MouseEvent) => void;
  onActivate: (row: TreeRow) => void;
  onContextMenu: (row: TreeRow, event: MouseEvent) => void;
  onCommitEdit: (values: InlineEditValues) => string | null;
  onCancelEdit: () => void;
  onSave: (row: TreeRow) => void;
  onDiscard: (row: TreeRow) => void;
}

const BAR_BUTTON =
  'shrink-0 flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-sans font-medium transition-colors disabled:opacity-50';

export function DocumentTreeRow({
  row,
  selected,
  active,
  dirty,
  saving,
  editor,
  onToggle,
  onSelect,
  onActivate,
  onContextMenu,
  onCommitEdit,
  onCancelEdit,
  onSave,
  onDiscard,
}: DocumentTreeRowProps) {
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
      onDoubleClick={() => (row.expandable ? onToggle(row) : onActivate(row))}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(row, event);
      }}
      style={{ height: DOCUMENT_ROW_HEIGHT, paddingLeft: 8 + row.depth * INDENT_PX }}
      className={`flex items-center gap-1.5 pr-3 font-mono text-xs cursor-default select-none transition-colors ${
        isDocument ? 'border-t border-border/60 first:border-t-0' : ''
      } ${
        selected
          ? isDocument
            ? 'bg-primary/20 text-foreground'
            : 'bg-primary/10'
          : 'hover:bg-accent/50'
      } ${active && !isDocument ? 'ring-1 ring-inset ring-primary/40' : ''}`}
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
      {(!editor || editor.mode === 'value') && (
        <>
          <span
            className={`shrink-0 max-w-[40%] truncate ${
              isDocument ? 'font-semibold text-foreground' : 'text-[var(--syntax-function)]'
            }`}
            title={row.key}
          >
            {row.key}
          </span>
          {!isDocument && <span className="shrink-0 text-muted-foreground">:</span>}
        </>
      )}
      {editor ? (
        <InlineEditor {...editor} onCommit={onCommitEdit} onCancel={onCancelEdit} />
      ) : (
        <>
          <TypeBadge label={label} />
          <span
            className={`min-w-0 truncate ${container ? 'text-muted-foreground' : ''}`}
            style={container ? undefined : { color: toneVar(label) }}
            title={container ? undefined : preview}
          >
            {preview}
          </span>
        </>
      )}
      {dirty && (
        <div
          className="ml-auto pl-2 flex items-center gap-1 shrink-0"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className="text-[10px] font-sans text-amber-400 mr-1">Modified</span>
          <button
            type="button"
            disabled={saving}
            onClick={() => onDiscard(row)}
            className={`${BAR_BUTTON} text-muted-foreground hover:text-foreground hover:bg-accent`}
          >
            <Undo2 className="w-3 h-3" /> Discard
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(row)}
            className={`${BAR_BUTTON} bg-emerald-600 hover:bg-emerald-500 text-white`}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
