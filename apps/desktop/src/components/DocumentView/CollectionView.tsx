import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { documentsFind } from '@db/core';
import type { DocumentCapabilities } from '@db/database';
import type { CollectionSchema, DocumentPage } from '@db/shared';
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZES,
  canPageForward,
  documentSelectionKey,
  insertFieldFilter,
  pageErrorResult,
  pageRangeLabel,
  retainSelection,
  selectDocument,
  selectedIndices,
  type FindInputs,
} from '../../lib/document/collectionView';
import type { DocumentExportTarget } from '../../lib/dataExport';
import { registerScope, type CommandScope } from '../../lib/commands/commandBus';
import { invokeErrorMessage } from '../../lib/invokeError';
import { QueryErrorCard } from '../SqlEditor/QueryErrorCard';
import { Select, type SelectOption } from '../ui/Select';
import { CollectionIndexes } from './CollectionIndexes';
import { CollectionToolbar, type DocumentViewMode } from './CollectionToolbar';
import { DeleteDocumentsModal } from './DeleteDocumentsModal';
import { DocumentEditorDrawer } from './DocumentEditorDrawer';
import { DocumentJsonView } from './DocumentJsonView';
import { DocumentList } from './DocumentList';
import { FieldsPanel } from './FieldsPanel';
import type { ShellInputHandle } from './ShellInput';
import { useDocumentEdits } from './useDocumentEdits';
import type { DocumentEdits } from '../../lib/document/documentEdits';

const EMPTY_INPUTS: FindInputs = { filter: '', projection: '', sort: '' };

const PAGE_SIZE_OPTIONS: SelectOption[] = DOCUMENT_PAGE_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}));

interface CollectionViewProps {
  connectionId: string;
  collection: CollectionSchema;
  isFocusedPane: boolean;
  /** Called after the view changes the collection's schema or its document count. */
  onSchemaChanged: () => void;
  edits: DocumentEdits;
  onEditsChange: (update: (prev: DocumentEdits) => DocumentEdits) => void;
  /** The sidebar's Insert Document… opened this tab; the view opens the insert drawer once. */
  insertRequested?: boolean;
  onInsertRequestHandled?: () => void;
  capabilities: DocumentCapabilities;
  indexKeyKinds: { value: string; label: string }[];
  /** The sidebar's or menu's New Index… opened this tab; the view shows Indexes with the drawer open. */
  indexRequested?: boolean;
  onIndexRequestHandled?: () => void;
}

interface Query {
  inputs: FindInputs;
  skip: number;
  pageSize: number;
  /** Bumped by Refresh so the same query runs again. */
  revision: number;
}

export function CollectionView({
  connectionId,
  collection,
  isFocusedPane,
  onSchemaChanged,
  edits,
  onEditsChange,
  insertRequested,
  onInsertRequestHandled,
  capabilities,
  indexKeyKinds,
  indexRequested,
  onIndexRequestHandled,
}: CollectionViewProps) {
  const [section, setSection] = useState<'documents' | 'indexes'>('documents');
  const [indexOverlayOpen, setIndexOverlayOpen] = useState(false);
  const [createIndexPending, setCreateIndexPending] = useState(false);
  const [draft, setDraft] = useState<FindInputs>(EMPTY_INPUTS);
  // Enter can arrive before React re-renders with the last keystroke, so Apply reads the ref.
  const draftRef = useRef(draft);
  const [query, setQuery] = useState<Query>({
    inputs: EMPTY_INPUTS,
    skip: 0,
    pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
    revision: 0,
  });
  // The page keeps the query that produced it, so a request in flight never pairs the shown
  // documents with the new query's skip or inputs.
  const [loaded, setLoaded] = useState<{ page: DocumentPage; query: Query } | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<DocumentViewMode>('list');
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const filterRef = useRef<ShellInputHandle>(null);
  const requestRef = useRef(0);
  const ns = useMemo(
    () => ({ database: collection.database, collection: collection.name }),
    [collection.database, collection.name],
  );

  useEffect(() => {
    const request = ++requestRef.current;
    setLoading(true);
    documentsFind({
      connectionId,
      ns: { database: collection.database, collection: collection.name },
      ...query.inputs,
      limit: query.pageSize,
      skip: query.skip,
    })
      .catch(
        (err: unknown): DocumentPage => ({
          documents: [],
          executionTimeMs: 0,
          error: invokeErrorMessage(err, 'Could not load documents'),
        }),
      )
      .then((next) => {
        // A slower earlier request must not overwrite the page the user asked for last.
        if (request !== requestRef.current) return;
        setLoaded({ page: next, query });
        setSelected((prev) => retainSelection(prev, next.documents));
        setLoading(false);
      });
  }, [connectionId, collection.database, collection.name, query]);

  const changeDraft = (patch: Partial<FindInputs>) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
  };

  const reload = useCallback(() => {
    setQuery((prev) => ({ ...prev, revision: prev.revision + 1 }));
  }, []);

  const loadedDocuments = useMemo(() => loaded?.page.documents ?? [], [loaded]);
  // Edits are kept per document with the original they were made on, so paging, filtering and
  // refreshing do not lose them and need no confirmation.
  const docEdits = useDocumentEdits({
    connectionId,
    ns,
    edits,
    setEdits: onEditsChange,
    documents: loadedDocuments,
    reload,
    onCountChanged: onSchemaChanged,
  });

  const apply = () => {
    setQuery((prev) => ({ ...prev, inputs: draftRef.current, skip: 0, revision: prev.revision + 1 }));
  };

  const refresh = reload;

  const goTo = (skip: number) => setQuery((prev) => ({ ...prev, skip: Math.max(0, skip) }));

  useEffect(() => {
    if (!insertRequested) return;
    docEdits.openInsert();
    onInsertRequestHandled?.();
    // Only a new request matters; the handlers are allowed to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequested]);

  useEffect(() => {
    if (!indexRequested) return;
    setSection('indexes');
    setCreateIndexPending(true);
    onIndexRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexRequested]);
  const clearCreateIndexPending = useCallback(() => setCreateIndexPending(false), []);

  const page = loaded?.page ?? null;
  const shownQuery = loaded?.query ?? query;
  const documents = useMemo(() => page?.documents ?? [], [page]);
  const total = page ? (page.total ?? null) : null;
  const errorResult = page ? pageErrorResult(page, shownQuery.inputs) : null;
  const shown = documents.length;
  const listKey = JSON.stringify([shownQuery.inputs, shownQuery.skip, shownQuery.pageSize]);
  const selectedRows = useMemo(() => selectedIndices(selected, documents), [selected, documents]);

  const exportTriggerRef = useRef<(() => void) | null>(null);
  const exportTarget = useMemo<DocumentExportTarget | null>(
    () => (loaded ? { connectionId, collection, inputs: loaded.query.inputs } : null),
    [connectionId, collection, loaded],
  );

  const scopeId = useId();
  const scopeRef = useRef<CommandScope | null>(null);
  const menuActionsNow = {
    refresh,
    find: () => filterRef.current?.focus(),
    insert: docEdits.openInsert,
    editDocument: () => {
      if (selectedRows.length === 1) docEdits.openEdit(selectedRows[0]);
    },
    deleteDocuments: () => docEdits.askDelete(selected),
  };
  const menuActions = useRef(menuActionsNow);
  menuActions.current = menuActionsNow;
  const isFocusedPaneRef = useRef(isFocusedPane);
  isFocusedPaneRef.current = isFocusedPane;
  const selectedCountRef = useRef(selected.length);
  selectedCountRef.current = selected.length;
  // The editor drawer and delete confirmation count as modals for the menu bar, so its commands
  // do not act on the collection behind them.
  const overlayOpenRef = useRef(docEdits.overlayOpen);
  const overlayOpen = docEdits.overlayOpen || indexOverlayOpen;
  overlayOpenRef.current = overlayOpen;

  useEffect(() => {
    const scope = registerScope('collection:' + scopeId, {
      'conn.refreshTable': () => menuActions.current.refresh(),
      'file.export': () => exportTriggerRef.current?.(),
      'edit.find': () => menuActions.current.find(),
      'edit.insertRow': () => menuActions.current.insert(),
      'edit.editDocument': () => menuActions.current.editDocument(),
      'edit.deleteRows': () => menuActions.current.deleteDocuments(),
    });
    // Only the focused pane's view is active, whatever order the panes mount in.
    scope.setActive(isFocusedPaneRef.current);
    scope.setContext({ selectedRowCount: selectedCountRef.current, modalOpen: overlayOpenRef.current });
    if (isFocusedPaneRef.current) scope.claim();
    scopeRef.current = scope;
    return () => {
      scopeRef.current = null;
      scope.dispose();
    };
  }, [scopeId]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.setActive(isFocusedPane);
    if (isFocusedPane) scope.claim();
  }, [isFocusedPane]);

  useEffect(() => {
    scopeRef.current?.setContext({ selectedRowCount: selected.length });
  }, [selected.length]);

  useEffect(() => {
    scopeRef.current?.setContext({ modalOpen: overlayOpen });
  }, [overlayOpen]);

  const pickPath = (path: string) => {
    const { text, caret } = insertFieldFilter(draftRef.current.filter, path);
    filterRef.current?.setText(text, caret);
  };


  const selectRow = (index: number, toggle: boolean) => {
    // The old page stays on screen while the next one loads; a click there would select a
    // document the new page may not show.
    if (loading) return;
    const key = documentSelectionKey(documents[index]);
    if (key === undefined) return;
    setSelected((prev) => selectDocument(prev, key, toggle));
  };

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background overflow-hidden">
      <div role="tablist" aria-label="Collection sections" className="flex items-center gap-1 px-3 pt-1.5 border-b border-border shrink-0">
        {(['documents', 'indexes'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`px-2.5 py-1 text-xs rounded-t-md border-b-2 -mb-px transition-colors ${
              section === id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {id === 'documents' ? 'Documents' : `Indexes (${collection.indexes.length})`}
          </button>
        ))}
      </div>

      {section === 'indexes' && (
        <CollectionIndexes
          connectionId={connectionId}
          collection={collection}
          capabilities={capabilities}
          keyKinds={indexKeyKinds}
          onSchemaChanged={onSchemaChanged}
          createRequested={createIndexPending}
          onCreateHandled={clearCreateIndexPending}
          onOverlayChange={setIndexOverlayOpen}
        />
      )}

      {section === 'documents' && (
      <>
      <CollectionToolbar
        draft={draft}
        onDraftChange={changeDraft}
        onApply={apply}
        filterRef={filterRef}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        fieldsOpen={fieldsOpen}
        onToggleFields={() => setFieldsOpen((open) => !open)}
        onRefresh={refresh}
        loading={loading}
        exportTarget={exportTarget}
        exportTriggerRef={exportTriggerRef}
      />

      <div className="flex flex-1 min-h-0">
        <div
          className={`flex flex-col flex-1 min-w-0 min-h-0 transition-opacity ${
            loading && page ? 'opacity-60' : ''
          }`}
        >
          {!page && (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
            </div>
          )}
          {errorResult && (
            <div className="p-4 overflow-auto">
              <QueryErrorCard result={errorResult} />
            </div>
          )}
          {page && !errorResult && shown === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              {shownQuery.skip > 0
                ? 'No more documents.'
                : shownQuery.inputs.filter.trim()
                  ? 'No documents match the filter.'
                  : 'This collection is empty.'}
            </div>
          )}
          {page && !errorResult && shown > 0 && viewMode === 'list' && (
            <DocumentList
              key={listKey}
              documents={docEdits.shown}
              selected={selectedRows}
              dirty={docEdits.dirty}
              savingIndex={docEdits.savingIndex}
              onSelect={selectRow}
              onChange={docEdits.change}
              onSave={(index) => void docEdits.save(index)}
              onDiscard={docEdits.discard}
              actions={{ edit: docEdits.openEdit, clone: docEdits.openClone, remove: docEdits.askDeleteAt }}
              aria-label={`Documents in ${collection.name}`}
            />
          )}
          {page && !errorResult && shown > 0 && viewMode === 'json' && (
            <DocumentJsonView documents={docEdits.shown} />
          )}
        </div>

        <AnimatePresence>
          {fieldsOpen && (
            <FieldsPanel
              key={collection.id}
              connectionId={connectionId}
              ns={ns}
              onPickPath={pickPath}
              onClose={() => setFieldsOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="px-3 py-1.5 bg-card border-t border-border text-xs font-mono text-muted-foreground flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 truncate">
          {page && !errorResult ? pageRangeLabel(shownQuery.skip, shown, total) : '—'}
          {selected.length > 0 && ` (${selected.length} selected)`}
          {docEdits.offPageCount > 0 && (
            <span className="ml-3 text-amber-400">
              {docEdits.offPageCount} unsaved {docEdits.offPageCount === 1 ? 'edit' : 'edits'} on other pages
              <button
                type="button"
                onClick={docEdits.discardOffPage}
                className="ml-1.5 underline underline-offset-2 hover:text-amber-300"
              >
                Discard
              </button>
            </span>
          )}
          {page && !errorResult && <span className="ml-3 opacity-70">{page.executionTimeMs} ms</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] hidden sm:inline">Documents</span>
            <Select
              size="sm"
              placement="top"
              className="w-[4.25rem]"
              value={String(query.pageSize)}
              options={PAGE_SIZE_OPTIONS}
              onChange={(value) => {
                setQuery((prev) => ({ ...prev, pageSize: Number(value), skip: 0 }));
              }}
              aria-label="Documents per page"
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => goTo(shownQuery.skip - shownQuery.pageSize)}
              disabled={shownQuery.skip === 0 || loading}
              title="Previous page"
              aria-label="Previous page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(shownQuery.skip + shownQuery.pageSize)}
              disabled={
                !page ||
                Boolean(errorResult) ||
                loading ||
                !canPageForward(shownQuery.skip, shown, shownQuery.pageSize, total)
              }
              title="Next page"
              aria-label="Next page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      </>
      )}

      <DocumentEditorDrawer
        request={docEdits.editor}
        namespace={collection.id}
        onSave={docEdits.saveEditor}
        onReload={docEdits.reloadEditor}
        onClose={docEdits.closeEditor}
      />
      <DeleteDocumentsModal
        count={docEdits.deleteCount}
        namespace={collection.id}
        busy={docEdits.deleting}
        onClose={docEdits.cancelDelete}
        onConfirm={() => void docEdits.confirmDelete()}
      />
    </div>
  );
}
