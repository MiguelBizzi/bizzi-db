import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { toggleComment } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { Bookmark, Play, Save } from 'lucide-react';
import { documentStatementRanges, documentsRun, documentsSampleFields } from '@db/core';
import type { QueryErrorPosition, SqlRange } from '@db/shared';
import type { CollectionSchema, SavedQuery } from '../../types';
import { registerScope, type CommandScope } from '../../lib/commands/commandBus';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { DEFAULT_DOCUMENT_PAGE_SIZE } from '../../lib/document/collectionView';
import { documentRunTarget, errorOffset, type DocumentRunTarget } from '../../lib/document/documentRun';
import {
  defaultQueryDatabase,
  type DocumentQueryState,
} from '../../lib/document/documentResults';
import { shellCollectionAt, shellCompletions } from '../../lib/document/shellComplete';
import { invokeErrorMessage } from '../../lib/invokeError';
import { hasRunnableSelection, type RunMode } from '../../lib/runTarget';
import {
  clampResultsFraction,
  DEFAULT_RESULTS_FRACTION,
  readResultsFraction,
  writeResultsFraction,
} from '../../lib/sqlEditorLayout';
import { SaveQueryModal } from '../SqlEditor/SaveQueryModal';
import { Select } from '../ui/Select';
import { SplitHandle } from '../ui/SplitHandle';
import {
  DocumentCodeEditor,
  type DocumentCodeEditorHandle,
  type DocumentRunRequest,
} from './DocumentCodeEditor';
import { DocumentResultsView } from './DocumentResultsView';

const SAMPLE_SIZE = 200;

interface DocumentQueryTabProps {
  connectionId: string;
  /** True when this tab is the active tab of the focused pane; menu runs then go to this editor. */
  isFocusedPane: boolean;
  initialText: string;
  /** Called (debounced, and on unmount) so the text survives tab switches and restarts. */
  onTextChange: (text: string) => void;
  /** The connection profile's database; empty when it has none. */
  profileDatabase: string;
  collections: CollectionSchema[];
  savedQueries: SavedQuery[];
  /** Results live in the app so they survive this component unmounting. */
  state: DocumentQueryState;
  onStateChange: (state: DocumentQueryState) => void;
  /** After every run: history and schema may have changed. */
  onExecuted: () => void | Promise<void>;
  onBookmarkQuery: (title: string, text: string, description?: string, tags?: string[]) => void;
  onLoadSavedQuery?: (title: string) => void;
}

export function DocumentQueryTab({
  connectionId,
  isFocusedPane,
  initialText,
  onTextChange,
  profileDatabase,
  collections,
  savedQueries,
  state,
  onStateChange,
  onExecuted,
  onBookmarkQuery,
  onLoadSavedQuery,
}: DocumentQueryTabProps) {
  const [text, setText] = useState(initialText);
  const [isRunning, setIsRunning] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [resultsFraction, setResultsFraction] = useState(() =>
    typeof localStorage === 'undefined' ? DEFAULT_RESULTS_FRACTION : readResultsFraction(localStorage),
  );
  const editorRef = useRef<DocumentCodeEditorHandle>(null);
  const viewRef = useRef<EditorView | null>(null);
  const scopeRef = useRef<CommandScope | null>(null);
  const scopeId = useId();
  const stateRef = useRef(state);
  stateRef.current = state;
  // Until the user picks one the default follows the schema, which may still be loading at mount.
  const database = state.databasePicked
    ? state.database
    : defaultQueryDatabase(profileDatabase, collections);
  const samples = useRef(new Map<string, Promise<string[]>>());

  const textRef = useRef(text);
  textRef.current = text;
  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;
  const isFocusedPaneRef = useRef(isFocusedPane);
  isFocusedPaneRef.current = isFocusedPane;

  useEffect(() => {
    const handle = window.setTimeout(() => onTextChangeRef.current(text), 300);
    return () => window.clearTimeout(handle);
  }, [text]);
  useEffect(() => () => onTextChangeRef.current(textRef.current), []);

  const databases = useMemo(() => {
    const names = new Set(collections.map((c) => c.database));
    names.add(database);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [collections, database]);

  const failure = (failedText: string, offset: number, error: unknown): Partial<DocumentQueryState> => ({
    results: [
      {
        id: `res_err_${Date.now()}`,
        command: failedText,
        timestamp: new Date().toISOString(),
        executionTimeMs: 0,
        error: invokeErrorMessage(error),
      },
    ],
    text: failedText,
    offset,
  });

  // One run at a time: a second request while one is in flight is ignored, and only the latest
  // run may publish its result or clear `isRunning`.
  const runningRef = useRef(false);
  const runIdRef = useRef(0);
  const handleRunRequest = async ({ mode, doc, selection }: DocumentRunRequest) => {
    if (runningRef.current) return;
    runningRef.current = true;
    const runId = ++runIdRef.current;
    const publish = (patch: Partial<DocumentQueryState>) => {
      if (runId === runIdRef.current) onStateChange({ ...stateRef.current, ...patch });
    };
    setIsRunning(true);
    let ran = false;
    try {
      // A selection or "run all" needs no statement ranges, so skip the round trip. If the ranges
      // cannot be had nothing runs: a script may hold deleteMany, and running all of it is not
      // what a caret run asked for.
      const needsRanges = mode === 'auto' && !hasRunnableSelection(doc, selection);
      let ranges: SqlRange[] | null = null;
      if (needsRanges) {
        try {
          ranges = await documentStatementRanges(connectionId, doc);
        } catch (error) {
          publish(failure(doc, 0, error));
          return;
        }
      }
      const target = documentRunTarget({ doc, selection, ranges, mode });
      if (!target) return;
      ran = true;
      try {
        const results = await documentsRun(connectionId, database, target.text, DEFAULT_DOCUMENT_PAGE_SIZE, true);
        publish({ results, text: target.text, offset: target.offset });
      } catch (error) {
        publish(failure(target.text, target.offset, error));
      }
    } finally {
      if (runId === runIdRef.current) {
        runningRef.current = false;
        setIsRunning(false);
      }
      if (ran) void onExecuted();
    }
  };
  const handleRunRequestRef = useRef(handleRunRequest);
  handleRunRequestRef.current = handleRunRequest;

  // The editor's own Mod-Enter keys and the Query menu go through here, so selection vs caret and
  // auto vs all behave identically from both.
  const runFromEditor = useCallback((mode: RunMode) => {
    const request = editorRef.current?.runRequest(mode);
    if (request) void handleRunRequestRef.current(request);
  }, []);

  const isSaveOpenRef = useRef(false);
  isSaveOpenRef.current = isSaveOpen;
  useEffect(() => {
    const scope = registerScope(`doc-query:${scopeId}`, {
      'query.run': () => runFromEditor('auto'),
      'query.runAll': () => runFromEditor('all'),
      // Reopening the form while it is open would reset what the user has typed into it.
      'file.saveQuery': () => {
        if (!isSaveOpenRef.current) setIsSaveOpen(true);
      },
      'edit.toggleComment': () => {
        if (viewRef.current) toggleComment(viewRef.current);
      },
    });
    scope.setActive(isFocusedPaneRef.current);
    scope.setContext({ sqlSelectionPresent: false, modalOpen: isSaveOpenRef.current });
    if (isFocusedPaneRef.current) scope.claim();
    scopeRef.current = scope;
    return () => {
      scopeRef.current = null;
      scope.dispose();
    };
  }, [scopeId, runFromEditor]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.setActive(isFocusedPane);
    if (isFocusedPane) scope.claim();
  }, [isFocusedPane]);

  useEffect(() => {
    scopeRef.current?.setContext({ modalOpen: isSaveOpen });
  }, [isSaveOpen]);

  const sampleFields = (collection: string): Promise<string[]> => {
    const key = `${database}.${collection}`;
    let sample = samples.current.get(key);
    if (!sample) {
      sample = documentsSampleFields(connectionId, { database, collection }, SAMPLE_SIZE).then(
        (found) => found.fields.map((field) => field.path),
        () => {
          samples.current.delete(key);
          return [];
        },
      );
      samples.current.set(key, sample);
    }
    return sample;
  };

  const complete = async (doc: string, caret: number) => {
    const collection = shellCollectionAt(doc, caret);
    return shellCompletions(doc, caret, {
      collections: collections.filter((c) => c.database === database).map((c) => c.name),
      fields: collection ? await sampleFields(collection) : [],
    });
  };

  const jumpToError = (position: QueryErrorPosition) =>
    editorRef.current?.jumpTo(errorOffset(state.text, state.offset, position));

  const runFromButton = (mode: RunMode) => {
    const request = editorRef.current?.runRequest(mode);
    if (request) void handleRunRequest(request);
  };

  const buttonClass =
    'pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs transition-colors border border-border';

  return (
    <div
      className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans text-foreground relative"
      onFocus={() => scopeRef.current?.claim()}
      onMouseDownCapture={() => scopeRef.current?.claim()}
    >
      <div className="p-2.5 bg-card border-b border-border flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
        <button
          onClick={() => runFromButton('auto')}
          disabled={isRunning}
          title={hasSelection ? 'Run the selected text' : 'Run the statement under the cursor'}
          className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold font-sans text-xs shadow-md transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>
            {isRunning
              ? 'Running...'
              : `${hasSelection ? 'Run Selection' : 'Run Statement'} (${shortcutLabel('query.run')})`}
          </span>
        </button>
        <button onClick={() => runFromButton('all')} disabled={isRunning} className={buttonClass}>
          Run All ({shortcutLabel('query.runAll')})
        </button>
        <Select
          aria-label="Database"
          size="sm"
          value={database}
          options={databases.map((name) => ({ value: name, label: name }))}
          onChange={(name) => onStateChange({ ...state, database: name, databasePicked: true })}
          searchable
          className="w-40"
        />
        <button onClick={() => setIsSaveOpen(true)} className={buttonClass}>
          <Save className="w-3.5 h-3.5 text-amber-400" />
          <span>Save ({shortcutLabel('file.saveQuery')})</span>
        </button>
        <button
          onClick={() => setShowSaved((open) => !open)}
          aria-expanded={showSaved}
          className={buttonClass}
        >
          <Bookmark className="w-3.5 h-3.5 text-secondary" />
          <span>Saved Queries ({savedQueries.length})</span>
        </button>
      </div>

      {showSaved && (
        <ul className="p-2 bg-popover border-b border-border max-h-48 overflow-y-auto shrink-0 text-xs">
          {savedQueries.length === 0 && (
            <li className="px-2 py-1.5 text-muted-foreground">No saved queries yet.</li>
          )}
          {savedQueries.map((query) => (
            <li key={query.id}>
              <button
                onClick={() => {
                  setText(query.sql);
                  onLoadSavedQuery?.(query.title);
                  setShowSaved(false);
                }}
                className="w-full flex items-baseline gap-3 px-2 py-1.5 rounded-lg hover:bg-accent text-left"
              >
                <span className="font-semibold text-foreground">{query.title}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {query.sql}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="min-h-0 bg-background overflow-hidden" style={{ flex: `${1 - resultsFraction} 1 0%` }}>
          <DocumentCodeEditor
            ref={editorRef}
            value={text}
            onChange={setText}
            complete={complete}
            onRunKey={runFromEditor}
            onViewReady={(view) => {
              viewRef.current = view;
            }}
            onSelectionChange={(has) => {
              setHasSelection(has);
              scopeRef.current?.setContext({ sqlSelectionPresent: has });
            }}
          />
        </div>

        <SplitHandle
          direction="column"
          onResize={([, second]) => {
            const next = clampResultsFraction(second);
            setResultsFraction(next);
            if (typeof localStorage !== 'undefined') writeResultsFraction(localStorage, next);
          }}
        />

        <div className="min-h-0 overflow-hidden" style={{ flex: `${resultsFraction} 1 0%` }}>
          <DocumentResultsView
            results={state.results}
            runText={state.text}
            isLoading={isRunning}
            exportName={database}
            onJump={jumpToError}
          />
        </div>
      </div>

      <AnimatePresence>
        {isSaveOpen && (
          <SaveQueryModal
            sql={text}
            title="Save Query"
            previewLabel="Query Preview"
            commentPrefix="//"
            onSave={(title, description, tags) => {
              onBookmarkQuery(title, text, description, tags);
              setIsSaveOpen(false);
            }}
            onClose={() => setIsSaveOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
