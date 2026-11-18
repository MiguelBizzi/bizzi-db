import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { documentsFind } from '@db/core';
import type { CollectionSchema, DocumentPage } from '@db/shared';
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZES,
  canPageForward,
  insertFieldFilter,
  pageErrorResult,
  pageRangeLabel,
  selectDocument,
  type FindInputs,
} from '../../lib/document/collectionView';
import { registerScope, type CommandScope } from '../../lib/commands/commandBus';
import { invokeErrorMessage } from '../../lib/invokeError';
import { QueryErrorCard } from '../SqlEditor/QueryErrorCard';
import { Select, type SelectOption } from '../ui/Select';
import { CollectionToolbar, type DocumentViewMode } from './CollectionToolbar';
import { DocumentJsonView } from './DocumentJsonView';
import { DocumentList } from './DocumentList';
import { FieldsPanel } from './FieldsPanel';
import type { ShellInputHandle } from './ShellInput';

const EMPTY_INPUTS: FindInputs = { filter: '', projection: '', sort: '' };

const PAGE_SIZE_OPTIONS: SelectOption[] = DOCUMENT_PAGE_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}));

interface CollectionViewProps {
  connectionId: string;
  collection: CollectionSchema;
  isFocusedPane: boolean;
  /** Called after the view changes the collection's schema (indexes, the collection itself). */
  onSchemaChanged: () => void;
}

interface Query {
  inputs: FindInputs;
  skip: number;
  pageSize: number;
  /** Bumped by Refresh so the same query runs again. */
  revision: number;
}

export function CollectionView({ connectionId, collection, isFocusedPane }: CollectionViewProps) {
  const [draft, setDraft] = useState<FindInputs>(EMPTY_INPUTS);
  // Enter can arrive before React re-renders with the last keystroke, so Apply reads the ref.
  const draftRef = useRef(draft);
  const [query, setQuery] = useState<Query>({
    inputs: EMPTY_INPUTS,
    skip: 0,
    pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
    revision: 0,
  });
  const [page, setPage] = useState<DocumentPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<DocumentViewMode>('list');
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const filterRef = useRef<ShellInputHandle>(null);
  const requestRef = useRef(0);
  const ns = { database: collection.database, collection: collection.name };

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
        setPage(next);
        setSelected((prev) => prev.filter((i) => i < next.documents.length));
        setLoading(false);
      });
  }, [connectionId, collection.database, collection.name, query]);

  const changeDraft = (patch: Partial<FindInputs>) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
  };

  const apply = useCallback(() => {
    setSelected([]);
    setQuery((prev) => ({ ...prev, inputs: draftRef.current, skip: 0, revision: prev.revision + 1 }));
  }, []);

  const refresh = useCallback(() => {
    setQuery((prev) => ({ ...prev, revision: prev.revision + 1 }));
  }, []);

  const goTo = (skip: number) => {
    setSelected([]);
    setQuery((prev) => ({ ...prev, skip: Math.max(0, skip) }));
  };

  const scopeId = useId();
  const scopeRef = useRef<CommandScope | null>(null);
  const menuActions = useRef({ refresh, find: () => filterRef.current?.focus() });
  menuActions.current = { refresh, find: () => filterRef.current?.focus() };
  const isFocusedPaneRef = useRef(isFocusedPane);
  isFocusedPaneRef.current = isFocusedPane;
  const selectedCountRef = useRef(selected.length);
  selectedCountRef.current = selected.length;

  useEffect(() => {
    const scope = registerScope('collection:' + scopeId, {
      'conn.refreshTable': () => menuActions.current.refresh(),
      'edit.find': () => menuActions.current.find(),
    });
    // Only the focused pane's view is active, whatever order the panes mount in.
    scope.setActive(isFocusedPaneRef.current);
    scope.setContext({ selectedRowCount: selectedCountRef.current });
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

  const pickPath = (path: string) => {
    const { text, caret } = insertFieldFilter(draftRef.current.filter, path);
    filterRef.current?.setText(text, caret);
  };

  const documents = page?.documents ?? [];
  const total = page ? (page.total ?? null) : null;
  const errorResult = page ? pageErrorResult(page, query.inputs) : null;
  const shown = documents.length;
  const listKey = JSON.stringify([query.inputs, query.skip, query.pageSize]);

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background overflow-hidden">
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
              {query.skip > 0
                ? 'No more documents.'
                : query.inputs.filter.trim()
                  ? 'No documents match the filter.'
                  : 'This collection is empty.'}
            </div>
          )}
          {page && !errorResult && shown > 0 && viewMode === 'list' && (
            <DocumentList
              key={listKey}
              documents={documents}
              selected={selected}
              onSelect={(index, toggle) => setSelected((prev) => selectDocument(prev, index, toggle))}
              aria-label={`Documents in ${collection.name}`}
            />
          )}
          {page && !errorResult && shown > 0 && viewMode === 'json' && <DocumentJsonView documents={documents} />}
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
          {page && !errorResult ? pageRangeLabel(query.skip, shown, total) : '—'}
          {selected.length > 0 && ` (${selected.length} selected)`}
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
                setSelected([]);
                setQuery((prev) => ({ ...prev, pageSize: Number(value), skip: 0 }));
              }}
              aria-label="Documents per page"
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => goTo(query.skip - query.pageSize)}
              disabled={query.skip === 0 || loading}
              title="Previous page"
              aria-label="Previous page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(query.skip + query.pageSize)}
              disabled={!page || Boolean(errorResult) || loading || !canPageForward(query.skip, shown, query.pageSize, total)}
              title="Next page"
              aria-label="Next page"
              className="p-1 rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
