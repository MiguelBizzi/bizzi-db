import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import type { DocValue } from '@db/shared';
import {
  DocEditError,
  addField,
  addFieldTarget,
  commitInlineEdit,
  getValue,
  insertItem,
  removeField,
  rowEditCapabilities,
  scalarText,
  scalarTypeOf,
  uniqueFieldKey,
} from '../../lib/document/docEdit';
import { ensureExpanded, flattenTree, treeKey, type TreePath, type TreeRow } from '../../lib/document/docTree';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { toast } from '../../lib/toast';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { useGridWindow } from '../TableView/useGridWindow';
import { DOCUMENT_ROW_HEIGHT, DocumentTreeRow, type InlineEditValues, type InlineEditorSpec } from './DocumentTree';

const NO_COLUMNS = [0];
const EMPTY_STRING: DocValue = { t: 'string', v: '' };

export interface DocumentActions {
  edit: (docIndex: number) => void;
  clone: (docIndex: number) => void;
  remove: (docIndex: number) => void;
}

interface DocumentListProps {
  /** The page with unsaved edits applied. */
  documents: DocValue[];
  /** Indices into `documents`. */
  selected: readonly number[];
  dirty: readonly number[];
  savingIndex: number | null;
  onSelect: (docIndex: number, toggle: boolean) => void;
  onChange: (docIndex: number, next: DocValue) => void;
  onSave: (docIndex: number) => void;
  onDiscard: (docIndex: number) => void;
  actions: DocumentActions;
  /** Views and time-series: no inline edits, and the menu offers no writes. */
  readOnly?: boolean;
  'aria-label'?: string;
}

interface ActiveEdit {
  docIndex: number;
  path: TreePath;
  spec: InlineEditorSpec;
  /** Added by Add Field; cancelling removes it again. */
  fresh: boolean;
}

const sameRow = (a: { docIndex: number; path: TreePath }, docIndex: number, path: TreePath) =>
  a.docIndex === docIndex && treeKey(a.docIndex, a.path) === treeKey(docIndex, path);

/**
 * The documents as an expandable tree. Like the data grid, only rows near the viewport are
 * mounted. Mount it with a new `key` when the query changes so expansion starts over; a refresh
 * of the same page keeps it.
 */
export function DocumentList({
  documents,
  selected,
  dirty,
  savingIndex,
  onSelect,
  onChange,
  onSave,
  onDiscard,
  actions,
  readOnly = false,
  'aria-label': ariaLabel,
}: DocumentListProps) {
  const portRef = useRef<HTMLDivElement>(null);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const [activeRow, setActiveRow] = useState<{ docIndex: number; path: TreePath } | null>(null);
  const [edit, setEditState] = useState<ActiveEdit | null>(null);
  // Committing moves focus back to the tree, which blurs the editor and cancels it before React
  // re-renders; the ref tells that cancel the edit is already over.
  const editRef = useRef(edit);
  const setEdit = (next: ActiveEdit | null) => {
    editRef.current = next;
    setEditState(next);
  };
  const [menu, setMenu] = useState<{ x: number; y: number; row: TreeRow } | null>(null);
  const rows = useMemo(() => flattenTree(documents, toggled), [documents, toggled]);
  const range = useGridWindow({
    portRef,
    rowCount: rows.length,
    offsets: NO_COLUMNS,
    leadingWidth: 0,
    rowHeight: DOCUMENT_ROW_HEIGHT,
    headerHeight: 0,
  });
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const dirtySet = useMemo(() => new Set(dirty), [dirty]);

  const toggle = (row: TreeRow) => {
    const key = treeKey(row.docIndex, row.path);
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const select = (row: TreeRow, event: MouseEvent) => {
    setActiveRow({ docIndex: row.docIndex, path: row.path });
    onSelect(row.docIndex, event.metaKey || event.ctrlKey);
  };

  const guarded = (run: () => void) => {
    try {
      run();
    } catch (error) {
      if (!(error instanceof DocEditError)) throw error;
      toast.error(error.message);
    }
  };

  const apply = (docIndex: number, change: (doc: DocValue) => DocValue) =>
    guarded(() => onChange(docIndex, change(documents[docIndex])));

  const startValueEdit = (docIndex: number, path: TreePath) => {
    const doc = documents[docIndex];
    if (readOnly || !doc || !rowEditCapabilities(doc, path).editValue) return;
    const value = getValue(doc, path);
    const type = scalarTypeOf(value);
    if (!type) return;
    const key = String(path[path.length - 1]);
    setEdit({ docIndex, path, fresh: false, spec: { mode: 'value', initial: { key, text: scalarText(value), type } } });
  };

  const startRename = (row: TreeRow) => {
    setEdit({
      docIndex: row.docIndex,
      path: row.path,
      fresh: false,
      spec: { mode: 'rename', initial: { key: row.key, text: '', type: 'string' } },
    });
  };

  const startAdd = (row: TreeRow) => {
    const doc = documents[row.docIndex];
    const target = addFieldTarget(doc, row.path);
    let path: TreePath;
    let next: DocValue;
    let container: TreePath;
    if (target.kind === 'field') {
      const key = uniqueFieldKey(getValue(doc, target.parentPath));
      next = addField(doc, target.parentPath, key, EMPTY_STRING, target.afterKey);
      path = [...target.parentPath, key];
      container = target.parentPath;
    } else {
      next = insertItem(doc, target.arrayPath, target.index, EMPTY_STRING);
      path = [...target.arrayPath, target.index];
      container = target.arrayPath;
    }
    onChange(row.docIndex, next);
    setToggled((prev) => ensureExpanded(prev, row.docIndex, container));
    const key = String(path[path.length - 1]);
    setEdit({
      docIndex: row.docIndex,
      path,
      fresh: true,
      spec: { mode: target.kind === 'field' ? 'field' : 'value', initial: { key, text: '', type: 'string' } },
    });
  };

  const commitEdit = (values: InlineEditValues): string | null => {
    const current = editRef.current;
    if (!current) return null;
    try {
      const { docIndex, path, spec } = current;
      const { doc, path: target } = commitInlineEdit(documents[docIndex], path, spec.mode, spec.initial.key, values);
      onChange(docIndex, doc);
      setEdit(null);
      setActiveRow({ docIndex, path: target });
      portRef.current?.focus();
      return null;
    } catch (error) {
      if (error instanceof DocEditError) return error.message;
      throw error;
    }
  };

  const cancelEdit = () => {
    const current = editRef.current;
    if (!current) return;
    setEdit(null);
    if (current.fresh) apply(current.docIndex, (doc) => removeField(doc, current.path));
    portRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !activeRow || edit) return;
    event.preventDefault();
    guarded(() => startValueEdit(activeRow.docIndex, activeRow.path));
  };

  const menuItems = (row: TreeRow): ContextMenuItem[] => {
    const doc = documents[row.docIndex];
    const can = rowEditCapabilities(doc, row.path);
    const last = row.path[row.path.length - 1];
    const parentIsArray = typeof last === 'number';
    const addsItem = row.value.t === 'array' || (row.value.t !== 'object' && parentIsArray);
    return [
      {
        id: 'edit-value',
        label: 'Edit Value',
        disabled: readOnly || !can.editValue,
        onSelect: () => startValueEdit(row.docIndex, row.path),
      },
      {
        id: 'add',
        label: addsItem ? 'Add Item' : 'Add Field',
        disabled: readOnly,
        onSelect: () => guarded(() => startAdd(row)),
      },
      { id: 'rename', label: 'Rename Field', disabled: readOnly || !can.rename, onSelect: () => startRename(row) },
      {
        id: 'duplicate',
        label: 'Duplicate Item',
        disabled: readOnly || !can.duplicate,
        onSelect: () =>
          apply(row.docIndex, (d) =>
            insertItem(d, row.path.slice(0, -1), Number(last) + 1, getValue(d, row.path)),
          ),
      },
      {
        id: 'remove',
        label: parentIsArray ? 'Remove Item' : 'Remove Field',
        danger: true,
        disabled: readOnly || !can.remove,
        onSelect: () => apply(row.docIndex, (d) => removeField(d, row.path)),
      },
      { id: 'sep', label: '', separator: true },
      {
        id: 'edit-document',
        label: 'Edit Document…',
        hint: shortcutLabel('edit.editDocument'),
        disabled: readOnly,
        onSelect: () => actions.edit(row.docIndex),
      },
      { id: 'clone', label: 'Clone Document…', disabled: readOnly, onSelect: () => actions.clone(row.docIndex) },
      {
        id: 'delete',
        label: 'Delete Document…',
        hint: shortcutLabel('edit.deleteRows'),
        danger: true,
        disabled: readOnly,
        onSelect: () => actions.remove(row.docIndex),
      },
    ];
  };

  const start = Math.min(range.rowStart, rows.length);
  const end = Math.min(range.rowEnd, rows.length);
  return (
    <div
      ref={portRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex-1 min-h-0 overflow-auto outline-none"
      role="tree"
      aria-multiselectable
      aria-label={ariaLabel}
    >
      <div style={{ height: rows.length * DOCUMENT_ROW_HEIGHT }}>
        <div style={{ height: start * DOCUMENT_ROW_HEIGHT }} />
        {rows.slice(start, end).map((row) => (
          <DocumentTreeRow
            key={treeKey(row.docIndex, row.path)}
            row={row}
            selected={selectedSet.has(row.docIndex)}
            active={activeRow !== null && sameRow(activeRow, row.docIndex, row.path)}
            dirty={row.depth === 0 && dirtySet.has(row.docIndex)}
            saving={savingIndex === row.docIndex}
            editor={edit && sameRow(edit, row.docIndex, row.path) ? edit.spec : undefined}
            onToggle={toggle}
            onSelect={select}
            onActivate={(r) => guarded(() => startValueEdit(r.docIndex, r.path))}
            onContextMenu={(r, event) => {
              // Ctrl-click opens this menu on macOS, so it must not toggle the selection.
              setActiveRow({ docIndex: r.docIndex, path: r.path });
              if (!selectedSet.has(r.docIndex)) onSelect(r.docIndex, false);
              setMenu({ x: event.clientX, y: event.clientY, row: r });
            }}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            onSave={(r) => onSave(r.docIndex)}
            onDiscard={(r) => onDiscard(r.docIndex)}
          />
        ))}
      </div>
      <AnimatePresence>
        {menu && (
          <ContextMenu
            key={`${menu.x}:${menu.y}`}
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.row)}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
