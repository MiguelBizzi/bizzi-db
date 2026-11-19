import { useMemo, useState } from 'react';
import { documentsDelete, documentsFind, documentsInsert, documentsReplace } from '@db/core';
import type { DocValue, Namespace } from '@db/shared';
import { documentSelectionKey } from '../../lib/document/collectionView';
import { newDocumentTemplate } from '../../lib/document/docEdit';
import { documentId, formatEditable } from '../../lib/document/docTree';
import {
  cloneText,
  dirtyIndices,
  idFilter,
  isConflictError,
  offPageEditCount,
  recordEdit,
  withEdits,
  type DocumentEdits,
} from '../../lib/document/documentEdits';
import { invokeErrorMessage } from '../../lib/invokeError';
import { toast } from '../../lib/toast';
import type { DocumentEditorRequest } from './DocumentEditorDrawer';

interface EditorState extends DocumentEditorRequest {
  /** Edit mode only: the stored document's text, sent as the replace guard. */
  original?: string;
  id?: DocValue;
  key?: string;
}

interface Options {
  connectionId: string;
  ns: Namespace;
  /**
   * Unsaved tree edits, owned by App per tab so switching tabs (which unmounts this view) keeps
   * them. Only Save, Discard and Delete remove entries; a reload never does.
   */
  edits: DocumentEdits;
  setEdits: (update: (prev: DocumentEdits) => DocumentEdits) => void;
  documents: DocValue[];
  /** Loads the current page again without asking about unsaved edits. */
  reload: () => void;
  /** Inserts and deletes change the document count the sidebar shows. */
  onCountChanged: () => void;
  /** `collectionWritable` of the collection; false refuses every edit, insert and delete. */
  writable: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function useDocumentEdits({
  connectionId,
  ns,
  edits,
  setEdits,
  documents: page,
  reload,
  onCountChanged,
  writable,
}: Options) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteKeys, setDeleteKeys] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const shown = useMemo(() => withEdits(page, edits), [page, edits]);
  const dirty = useMemo(() => dirtyIndices(page, edits), [page, edits]);
  const offPageCount = useMemo(() => offPageEditCount(page, edits), [page, edits]);
  const savingIndex = savingKey === null ? null : page.findIndex((doc) => documentSelectionKey(doc) === savingKey);

  const drop = (keys: readonly string[]) =>
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.includes(key))));

  const keyAt = (docIndex: number) => {
    const doc = page[docIndex];
    return doc ? documentSelectionKey(doc) : undefined;
  };

  const change = (docIndex: number, next: DocValue) => {
    if (!writable) return;
    const key = keyAt(docIndex);
    if (key === undefined) {
      toast.error('This document has no _id, so it cannot be edited.');
      return;
    }
    setEdits((prev) => recordEdit(prev, key, page[docIndex], next));
  };

  const discard = (docIndex: number) => {
    const key = keyAt(docIndex);
    if (key !== undefined) drop([key]);
  };

  const save = async (docIndex: number) => {
    const key = keyAt(docIndex);
    const edit = key === undefined ? undefined : edits[key];
    if (key === undefined || !edit || savingKey) return;
    setSavingKey(key);
    try {
      await documentsReplace(connectionId, ns, formatEditable(edit.original), formatEditable(edit.edited));
      drop([key]);
      toast.success('Document saved');
      reload();
    } catch (err) {
      const message = invokeErrorMessage(err, 'Could not save the document');
      if (isConflictError(message)) {
        toast(message, 'error', 10_000, {
          label: 'Reload',
          run: () => {
            drop([key]);
            reload();
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setSavingKey(null);
    }
  };

  const discardOffPage = () => {
    const present = new Set(page.map(documentSelectionKey));
    drop(Object.keys(edits).filter((key) => !present.has(key)));
  };

  const openEdit = (docIndex: number) => {
    if (!writable) return;
    const doc = page[docIndex];
    const key = keyAt(docIndex);
    if (!doc || key === undefined) {
      toast.error('This document has no _id, so it cannot be edited.');
      return;
    }
    const edit = edits[key];
    setEditor({
      mode: 'edit',
      text: formatEditable(edit?.edited ?? doc),
      revision: 0,
      original: formatEditable(edit?.original ?? doc),
      id: documentId(doc),
      key,
    });
  };

  const openInsert = () => {
    if (writable) setEditor({ mode: 'insert', text: newDocumentTemplate(), revision: 0 });
  };

  const openClone = (docIndex: number) => {
    if (!writable) return;
    const doc = shown[docIndex];
    if (doc) setEditor({ mode: 'clone', text: cloneText(doc), revision: 0 });
  };

  const saveEditor = async (text: string): Promise<string | null> => {
    if (!editor) return null;
    try {
      if (editor.mode === 'edit') {
        await documentsReplace(connectionId, ns, editor.original ?? '', text);
        if (editor.key) drop([editor.key]);
        toast.success('Document saved');
      } else {
        await documentsInsert(connectionId, ns, text);
        toast.success('Document inserted');
        onCountChanged();
      }
      setEditor(null);
      reload();
      return null;
    } catch (err) {
      return invokeErrorMessage(err, 'Could not save the document');
    }
  };

  const reloadEditor = async () => {
    const id = editor?.id;
    if (!id) return;
    try {
      const found = await documentsFind({
        connectionId,
        ns,
        filter: idFilter(id),
        projection: '',
        sort: '',
        limit: 1,
        skip: 0,
      });
      if (found.error) {
        toast.error(found.error);
        return;
      }
      const doc = found.documents[0];
      if (!doc) {
        toast.error('The document no longer exists.');
        return;
      }
      const text = formatEditable(doc);
      setEditor((prev) => prev && { ...prev, text, original: text, revision: prev.revision + 1 });
      if (editor?.key) drop([editor.key]);
      reload();
    } catch (err) {
      toast.error(invokeErrorMessage(err, 'Could not reload the document'));
    }
  };

  const askDelete = (keys: string[]) => {
    if (writable && keys.length > 0) setDeleteKeys(keys);
  };

  const askDeleteAt = (docIndex: number) => {
    const key = keyAt(docIndex);
    if (key === undefined) toast.error('This document has no _id, so it cannot be deleted here.');
    else askDelete([key]);
  };

  const confirmDelete = async () => {
    if (!deleteKeys || deleting) return;
    setDeleting(true);
    try {
      const count = await documentsDelete(connectionId, ns, deleteKeys);
      drop(deleteKeys);
      setDeleteKeys(null);
      toast.success(`Deleted ${plural(count, 'document')}`);
      reload();
      onCountChanged();
    } catch (err) {
      toast.error(invokeErrorMessage(err, 'Could not delete the documents'));
    } finally {
      setDeleting(false);
    }
  };

  return {
    shown,
    dirty,
    savingIndex: savingIndex === -1 ? null : savingIndex,
    change,
    save,
    discard,
    offPageCount,
    discardOffPage,
    editor,
    openEdit,
    openInsert,
    openClone,
    saveEditor,
    reloadEditor,
    closeEditor: () => setEditor(null),
    deleteCount: deleteKeys?.length ?? null,
    deleting,
    askDelete,
    askDeleteAt,
    confirmDelete,
    cancelDelete: () => setDeleteKeys(null),
    overlayOpen: editor !== null || deleteKeys !== null,
  };
}
