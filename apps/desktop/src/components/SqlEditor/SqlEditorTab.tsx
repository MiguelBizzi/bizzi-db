import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { SqlRange } from '@db/shared';
import { Modal, ModalPanel } from '../ui/Modal';
import { Popover } from '../ui/Popover';
import { format } from 'sql-formatter';
import { toggleComment } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import {
  Play,
  ChevronDown,
  Code,
  Save,
  Bookmark,
  Tag as TagIcon,
  Plus,
  X,
  Search,
  Trash2,
} from 'lucide-react';
import { QueryExecutionResult, SavedQuery, DatabaseSchema } from '../../types';
import { QueryResultsView, type QueryGridActions } from './QueryResultsView';
import { SqlCodeEditor, type SqlCodeEditorHandle, type SqlRunRequest } from './SqlCodeEditor';
import { hasRunnableSelection, resolveRunTarget, type RunMode } from '../../lib/runTarget';
import { SplitHandle } from '../ui/SplitHandle';
import { registerScope, type CommandScope } from '../../lib/commands/commandBus';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { invokeErrorMessage } from '../../lib/invokeError';
import { toast } from '../../lib/toast';
import { queryErrorText } from '../../lib/sqlQuery';
import { analyzeQueryResult } from '../../lib/queryResultTable';
import { lastPageOffset, mergePageResult, QUERY_PAGE_SIZE } from '../../lib/queryPaging';
import {
  clampResultIndex,
  replaceResult,
  type SqlTabState,
} from '../../lib/sqlTabState';
import {
  clampResultsFraction,
  DEFAULT_RESULTS_FRACTION,
  readResultsFraction,
  writeResultsFraction,
} from '../../lib/sqlEditorLayout';

interface SqlEditorTabProps {
  /** True when this tab is the active tab of the focused pane; menu runs then go to this editor. */
  isFocusedPane: boolean;
  initialSql?: string;
  /** Called (debounced, and on unmount) so the tab's SQL survives tab switches and restarts. */
  onSqlChange?: (sql: string) => void;
  /** Results live in the app so they survive this component unmounting. */
  tabState: SqlTabState;
  onTabStateChange: (update: (prev: SqlTabState) => SqlTabState) => void;
  /** Bumped per table whenever its data changes outside this tab. */
  dataRevisions: Record<string, number>;
  grid: Omit<QueryGridActions, 'tables' | 'onLoadPage' | 'onFetchAll'>;
  currentDatabase: DatabaseSchema;
  savedQueries: SavedQuery[];
  /**
   * `silent` skips query history, for background refreshes of an existing
   * result. `unpaged` returns every row instead of the first page.
   */
  onExecuteQuery: (
    sql: string,
    options?: { silent?: boolean; unpaged?: boolean }
  ) => Promise<QueryExecutionResult[]>;
  /** Where each statement of a script sits, to run the one under the caret. */
  onStatementRanges: (sql: string) => Promise<SqlRange[]>;
  /** One page of a single statement, for paging and refreshing a result. */
  onQueryPage: (
    sql: string,
    limit: number,
    offset: number,
    withCount: boolean
  ) => Promise<QueryExecutionResult>;
  onBookmarkQuery: (title: string, sql: string, description?: string, tags?: string[]) => void;
  onDeleteSavedQuery?: (id: string) => void;
  onUpdateSavedQueryTags?: (id: string, tags: string[]) => void;
  onLoadSavedQuery?: (title: string, sql: string) => void;
}

export const SqlEditorTab: React.FC<SqlEditorTabProps> = ({
  isFocusedPane,
  initialSql = 'SELECT * FROM users ORDER BY created_at DESC LIMIT 50;',
  onSqlChange,
  tabState,
  onTabStateChange,
  dataRevisions,
  grid,
  currentDatabase,
  savedQueries,
  onExecuteQuery,
  onQueryPage,
  onStatementRanges,
  onBookmarkQuery,
  onDeleteSavedQuery,
  onUpdateSavedQueryTags,
  onLoadSavedQuery,
}) => {
  const [sql, setSql] = useState(initialSql);
  const [isRunning, setIsRunning] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const editorRef = useRef<SqlCodeEditorHandle>(null);
  const viewRef = useRef<EditorView | null>(null);
  const scopeRef = useRef<CommandScope | null>(null);
  const scopeId = useId();
  const runMenuRef = useRef<HTMLDivElement>(null);
  const queryResults = tabState.results;
  const onSqlChangeRef = useRef(onSqlChange);
  onSqlChangeRef.current = onSqlChange;
  const sqlRef = useRef(sql);
  sqlRef.current = sql;
  const dataRevisionsRef = useRef(dataRevisions);
  dataRevisionsRef.current = dataRevisions;
  const tablesRef = useRef(currentDatabase.tables);
  tablesRef.current = currentDatabase.tables;
  const refreshing = useRef(new Set<string>());
  const onExecuteQueryRef = useRef(onExecuteQuery);
  onExecuteQueryRef.current = onExecuteQuery;
  const onQueryPageRef = useRef(onQueryPage);
  onQueryPageRef.current = onQueryPage;

  useEffect(() => {
    const handle = window.setTimeout(() => onSqlChangeRef.current?.(sql), 300);
    return () => window.clearTimeout(handle);
  }, [sql]);

  useEffect(() => () => onSqlChangeRef.current?.(sqlRef.current), []);

  const revisionOf = (result: QueryExecutionResult): number => {
    const source = analyzeQueryResult(result, tablesRef.current).sourceTable;
    return source ? (dataRevisionsRef.current[source.id] ?? 0) : 0;
  };

  const commitResults = (results: QueryExecutionResult[]) => {
    const fetchedRevisions = Object.fromEntries(
      results.map((result) => [result.id, revisionOf(result)])
    );
    onTabStateChange(() => ({ results, activeResultIndex: 0, fetchedRevisions }));
  };

  /**
   * Fetches `limit` rows of the result's query from `offset` and swaps them in.
   * Asking for the page already shown refreshes it, and recounts the total.
   */
  const loadResultPage = async (
    result: QueryExecutionResult,
    limit: number,
    offset: number
  ) => {
    const refresh = limit === result.pageSize && offset === (result.pageOffset ?? 0);
    let fresh: QueryExecutionResult | undefined;
    try {
      fresh = await onQueryPageRef.current(result.query, limit, offset, refresh);
      // Rows were deleted from under this page: show the last one that still exists.
      if (!fresh.error && offset > 0 && fresh.rows?.length === 0) {
        const first = await onQueryPageRef.current(result.query, limit, 0, true);
        const lastOffset = first.error ? 0 : lastPageOffset(first.totalRows ?? 0, limit);
        fresh =
          lastOffset === 0
            ? first
            : await onQueryPageRef.current(result.query, limit, lastOffset, true);
      }
    } catch (e: unknown) {
      toast.error(invokeErrorMessage(e));
    }
    if (fresh?.error) {
      toast.error(queryErrorText(fresh.error));
      fresh = undefined;
    }
    const revision = revisionOf(result);
    onTabStateChange((prev) => {
      const current = prev.results.find((item) => item.id === result.id);
      return {
        ...prev,
        results:
          fresh && current
            ? replaceResult(prev.results, result.id, mergePageResult(current, fresh))
            : prev.results,
        fetchedRevisions: { ...prev.fetchedRevisions, [result.id]: revision },
      };
    });
  };

  const rerunResult = (result: QueryExecutionResult) =>
    loadResultPage(result, result.pageSize ?? QUERY_PAGE_SIZE, result.pageOffset ?? 0);

  const fetchAllRows = async (result: QueryExecutionResult) => {
    const [all] = await onExecuteQueryRef.current(result.query, { silent: true, unpaged: true });
    if (!all || all.error) throw new Error(queryErrorText(all?.error));
    return (all.rows ?? []) as Record<string, unknown>[];
  };

  // Re-run results whose source table changed (apply, insert) while they were on screen or away.
  useEffect(() => {
    for (const result of queryResults) {
      if (result.error || refreshing.current.has(result.id)) continue;
      const source = analyzeQueryResult(result, currentDatabase.tables).sourceTable;
      if (!source) continue;
      if ((tabState.fetchedRevisions[result.id] ?? 0) === (dataRevisions[source.id] ?? 0)) continue;
      refreshing.current.add(result.id);
      void rerunResult(result).finally(() => refreshing.current.delete(result.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRevisions, queryResults, tabState.fetchedRevisions]);

  const gridActions: QueryGridActions = useMemo(
    () => ({
      ...grid,
      tables: currentDatabase.tables,
      onLoadPage: loadResultPage,
      onFetchAll: fetchAllRows,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, currentDatabase.tables]
  );
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [resultsFraction, setResultsFraction] = useState(() =>
    typeof localStorage === 'undefined'
      ? DEFAULT_RESULTS_FRACTION
      : readResultsFraction(localStorage)
  );

  // Save Modal state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>(['Analytics']);
  const [newTagInput, setNewTagInput] = useState('');

  // Saved Queries Panel search & tag filter
  const [savedSearchTerm, setSavedSearchTerm] = useState('');
  const [selectedFilterTag, setSelectedFilterTag] = useState<string>('ALL');
  const [inlineNewTagQueryId, setInlineNewTagQueryId] = useState<string | null>(null);
  const [inlineTagInput, setInlineTagInput] = useState('');

  const SUGGESTED_TAGS = ['Core', 'Analytics', 'Revenue', 'Inventory', 'Performance', 'Daily', 'Audit'];

  const handleRunQuery = async (queryToRun?: string) => {
    const targetSql = queryToRun || sql;
    if (!targetSql.trim()) return;

    setIsRunning(true);
    try {
      const res = await onExecuteQuery(targetSql);
      commitResults(res);
    } catch (e: unknown) {
      commitResults([
        {
          id: 'res_err_' + Date.now(),
          query: targetSql,
          timestamp: new Date().toISOString(),
          executionTimeMs: 0,
          error: invokeErrorMessage(e),
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunRequest = async ({ mode, doc, selection }: SqlRunRequest) => {
    // A selection or "run all" needs no statement ranges, so skip the round trip.
    const needsRanges = mode === 'auto' && !hasRunnableSelection(doc, selection);
    const ranges = needsRanges ? await onStatementRanges(doc).catch(() => null) : null;
    const target = resolveRunTarget({ doc, selection, ranges, mode });
    if (target) await handleRunQuery(target.sql);
  };

  const runFromButton = (mode: RunMode) => {
    setRunMenuOpen(false);
    const request = editorRef.current?.runRequest(mode);
    if (request) void handleRunRequest(request);
    else void handleRunQuery();
  };

  // The menu bar's Run commands go to the focused editor (see the command bus).
  const handleRunRequestRef = useRef(handleRunRequest);
  handleRunRequestRef.current = handleRunRequest;
  const isFocusedPaneRef = useRef(isFocusedPane);
  isFocusedPaneRef.current = isFocusedPane;
  // Save and Format read state (`sql`, the save modal) that changes every render, so they are
  // reached through refs too: the scope below registers once per scope id and would otherwise
  // keep calling the closures of the first render (formatting stale text).
  const handleFormatQueryRef = useRef<() => void>(() => {});
  const handleOpenSaveModalRef = useRef<() => void>(() => {});
  const isSaveModalOpenRef = useRef(false);
  // The results toolbar's Export menu hands its default CSV export to the menu bar's Export.
  const exportTriggerRef = useRef<(() => void) | null>(null);
  // Mirrors when that Export control has rows to export: the shown result has rows, not running.
  const activeResult = queryResults[clampResultIndex(tabState.activeResultIndex, queryResults.length)];
  const sqlResultPresent =
    !isRunning && Boolean(activeResult && !activeResult.error && (activeResult.rows?.length ?? 0) > 0);
  const sqlResultPresentRef = useRef(sqlResultPresent);
  sqlResultPresentRef.current = sqlResultPresent;
  // Query > Run / Run All and the editor's own Cmd+Enter / Cmd+Shift+Enter all go through here,
  // so selection vs caret and auto vs all behave identically from the menu and the keyboard.
  const runFromMenu = useCallback((mode: RunMode) => {
    const request = editorRef.current?.runRequest(mode);
    if (request) void handleRunRequestRef.current(request);
  }, []);
  useEffect(() => {
    const scope = registerScope('sql:' + scopeId, {
      'query.run': () => runFromMenu('auto'),
      'query.runAll': () => runFromMenu('all'),
      // Reopening the form while it is open would reset what the user has typed into it.
      'file.saveQuery': () => {
        if (!isSaveModalOpenRef.current) handleOpenSaveModalRef.current();
      },
      'edit.formatSql': () => handleFormatQueryRef.current(),
      'edit.toggleComment': () => {
        const view = viewRef.current;
        if (view) toggleComment(view);
      },
      'file.export': () => exportTriggerRef.current?.(),
    });
    // Only the focused pane's editor is active, whatever order the panes mount in.
    scope.setActive(isFocusedPaneRef.current);
    scope.setContext({
      sqlSelectionPresent: false,
      sqlResultPresent: sqlResultPresentRef.current,
      modalOpen: isSaveModalOpenRef.current,
    });
    if (isFocusedPaneRef.current) scope.claim();
    scopeRef.current = scope;
    return () => {
      scopeRef.current = null;
      scope.dispose();
    };
  }, [scopeId, runFromMenu]);

  // The focused pane is the source of truth for which editor the menu runs in; the bus prefers
  // active scopes, so mount order cannot steal the menu from the highlighted pane.
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.setActive(isFocusedPane);
    if (isFocusedPane) scope.claim();
  }, [isFocusedPane]);

  useEffect(() => {
    scopeRef.current?.setContext({ sqlResultPresent });
  }, [sqlResultPresent]);

  // The Save Query form counts as a modal for the menu bar (e.g. Cmd+W must not close the tab
  // while a title is being typed).
  useEffect(() => {
    scopeRef.current?.setContext({ modalOpen: isSaveModalOpen });
  }, [isSaveModalOpen]);

  useEffect(() => {
    if (!runMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!runMenuRef.current?.contains(event.target as Node)) setRunMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRunMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [runMenuOpen]);

  const handleFormatQuery = () => {
    try {
      const formatted = format(sql, {
        language: currentDatabase.dialect === 'MySQL' ? 'mysql' : 'postgresql',
      });
      setSql(formatted);
    } catch {
      // Fallback formatting if syntax incomplete
    }
  };

  const handleOpenSaveModal = () => {
    const defaultTitle = sql.trim().split('\n')[0].replace(/^--\s*/, '').slice(0, 40) || 'New Saved Query';
    setSaveTitle(defaultTitle);
    setSaveDescription('');
    setSaveTags(['Analytics']);
    setIsSaveModalOpen(true);
  };

  handleFormatQueryRef.current = handleFormatQuery;
  handleOpenSaveModalRef.current = handleOpenSaveModal;
  isSaveModalOpenRef.current = isSaveModalOpen;

  const handleConfirmSaveQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTitle.trim()) return;
    onBookmarkQuery(saveTitle.trim(), sql, saveDescription.trim(), saveTags);
    setIsSaveModalOpen(false);
  };

  const toggleSaveTag = (tag: string) => {
    if (saveTags.includes(tag)) {
      setSaveTags(saveTags.filter((t) => t !== tag));
    } else {
      setSaveTags([...saveTags, tag]);
    }
  };

  const handleAddSaveTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !saveTags.includes(trimmed)) {
      setSaveTags([...saveTags, trimmed]);
      setNewTagInput('');
    }
  };

  const handleAddInlineTag = (queryId: string, currentTags: string[]) => {
    const trimmed = inlineTagInput.trim();
    if (trimmed && !currentTags.includes(trimmed) && onUpdateSavedQueryTags) {
      onUpdateSavedQueryTags(queryId, [...currentTags, trimmed]);
      setInlineTagInput('');
      setInlineNewTagQueryId(null);
    }
  };

  const handleRemoveInlineTag = (queryId: string, currentTags: string[], tagToRemove: string) => {
    if (onUpdateSavedQueryTags) {
      onUpdateSavedQueryTags(
        queryId,
        currentTags.filter((t) => t !== tagToRemove)
      );
    }
  };

  // Collect all unique tags from savedQueries
  const allUniqueTags = Array.from(
    new Set(savedQueries.flatMap((sq) => sq.tags || []))
  );

  // Filtered saved queries
  const filteredSavedQueries = savedQueries.filter((sq) => {
    const matchesSearch =
      sq.title.toLowerCase().includes(savedSearchTerm.toLowerCase()) ||
      sq.sql.toLowerCase().includes(savedSearchTerm.toLowerCase()) ||
      (sq.description && sq.description.toLowerCase().includes(savedSearchTerm.toLowerCase()));

    const matchesTag =
      selectedFilterTag === 'ALL' || (sq.tags && sq.tags.includes(selectedFilterTag));

    return matchesSearch && matchesTag;
  });

  return (
    <div
      className="flex-1 flex h-full bg-background overflow-hidden font-sans text-foreground relative"
      onFocus={() => scopeRef.current?.claim()}
      onMouseDownCapture={() => scopeRef.current?.claim()}
    >
      {/* Main Editor & Results Pane Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Editor Action Header Bar */}
        <div className="p-2.5 bg-card border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs">
          {/* Left Action Buttons */}
          <div className="flex items-center gap-2">
            <div ref={runMenuRef} className="relative flex items-stretch">
              <button
                onClick={() => runFromButton('auto')}
                disabled={isRunning}
                title={
                  hasSelection
                    ? 'Run the selected SQL'
                    : 'Run the statement under the cursor'
                }
                className="pressable flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-l-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold font-sans text-xs shadow-md transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {isRunning
                    ? 'Running...'
                    : hasSelection
                      ? `Run Selection (${shortcutLabel('query.run')})`
                      : `Run Statement (${shortcutLabel('query.run')})`}
                </span>
              </button>
              <button
                onClick={() => setRunMenuOpen((open) => !open)}
                disabled={isRunning}
                aria-label="More run options"
                className="pressable flex items-center px-1.5 rounded-r-lg border-l border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {runMenuOpen && (
                  <Popover
                    origin="top"
                    className="absolute left-0 top-full mt-1 min-w-44 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-40 text-xs text-popover-foreground"
                  >
                    <button
                      type="button"
                      onClick={() => runFromButton('all')}
                      className="w-full flex items-center justify-between gap-4 px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground font-sans text-left"
                    >
                      <span>Run All</span>
                      <span className="text-muted-foreground font-mono">{shortcutLabel('query.runAll')}</span>
                    </button>
                  </Popover>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleFormatQuery}
              className="pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs transition-colors border border-border"
            >
              <Code className="w-3.5 h-3.5 text-primary" />
              <span>Format SQL</span>
            </button>

            <button
              onClick={handleOpenSaveModal}
              className="pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs transition-colors font-medium border border-border"
            >
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>Save</span>
            </button>

            <button
              onClick={() => setShowSavedQueries(!showSavedQueries)}
              className={`pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showSavedQueries
                  ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
                  : 'bg-muted text-foreground border-border hover:bg-accent'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-secondary" />
              <span>Saved Queries ({savedQueries.length})</span>
            </button>
          </div>
        </div>

        {/* Saved Queries Overlay Drawer / Panel */}
        {showSavedQueries && (
          <div className="p-4 bg-popover border-b border-border space-y-3 max-h-72 overflow-y-auto font-sans shadow-inner shrink-0 text-popover-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <span>Saved Queries Library</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-normal border border-border">
                  {filteredSavedQueries.length} of {savedQueries.length}
                </span>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter saved queries..."
                  value={savedSearchTerm}
                  onChange={(e) => setSavedSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-background border border-border rounded-lg text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-52"
                />
              </div>
            </div>

            {/* Tag Filter Chips */}
            {allUniqueTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-mono text-muted-foreground mr-1 flex items-center gap-1">
                  <TagIcon className="w-3 h-3 text-muted-foreground" /> Tags:
                </span>
                <button
                  onClick={() => setSelectedFilterTag('ALL')}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    selectedFilterTag === 'ALL'
                      ? 'bg-primary text-primary-foreground border-primary font-semibold'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  All
                </button>
                {allUniqueTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedFilterTag(tag)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      selectedFilterTag === tag
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* Saved Queries Grid List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {filteredSavedQueries.map((sq) => (
                <div
                  key={sq.id}
                  className="p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors flex flex-col justify-between gap-2 group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>{sq.title}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setSql(sq.sql);
                            onLoadSavedQuery?.(sq.title, sq.sql);
                            setShowSavedQueries(false);
                          }}
                          title="Load SQL into editor"
                          className="px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-mono transition-colors"
                        >
                          Load
                        </button>

                        {onDeleteSavedQuery && (
                          <button
                            onClick={() => onDeleteSavedQuery(sq.id)}
                            title="Delete saved query"
                            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {sq.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {sq.description}
                      </p>
                    )}

                    <div className="font-mono text-[10px] text-muted-foreground truncate mt-1 bg-background p-1.5 rounded border border-border">
                      {sq.sql}
                    </div>
                  </div>

                  {/* Tags Row */}
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border">
                    {(sq.tags || []).map((t) => (
                      <span
                        key={t}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium flex items-center gap-1 group/tag"
                      >
                        #{t}
                        <button
                          onClick={() => handleRemoveInlineTag(sq.id, sq.tags || [], t)}
                          title="Remove tag"
                          className="hover:text-destructive ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* Add Tag Inline Button */}
                    {inlineNewTagQueryId === sq.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Tag..."
                          autoFocus
                          value={inlineTagInput}
                          onChange={(e) => setInlineTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddInlineTag(sq.id, sq.tags || []);
                            } else if (e.key === 'Escape') {
                              setInlineNewTagQueryId(null);
                            }
                          }}
                          className="w-16 px-1.5 py-0.5 bg-background border border-primary rounded text-[9px] text-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => handleAddInlineTag(sq.id, sq.tags || [])}
                          className="text-[9px] px-1 rounded bg-primary text-primary-foreground"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setInlineNewTagQueryId(sq.id);
                          setInlineTagInput('');
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-background text-muted-foreground hover:text-foreground border border-border flex items-center gap-0.5 transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Tag</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredSavedQueries.length === 0 && (
                <div className="col-span-full text-center py-6 text-xs text-muted-foreground">
                  No saved queries match your filter criteria.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Code Area + Results */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            className="min-h-0 bg-background overflow-hidden"
            style={{ flex: `${1 - resultsFraction} 1 0%` }}
          >
            <SqlCodeEditor
              ref={editorRef}
              value={sql}
              tables={currentDatabase.tables}
              onChange={setSql}
              onRunKey={runFromMenu}
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
              if (typeof localStorage !== 'undefined') {
                writeResultsFraction(localStorage, next);
              }
            }}
          />

          <div className="min-h-0 overflow-hidden" style={{ flex: `${resultsFraction} 1 0%` }}>
            <QueryResultsView
              results={queryResults}
              isLoading={isRunning}
              activeIndex={clampResultIndex(tabState.activeResultIndex, queryResults.length)}
              onActiveIndexChange={(index) =>
                onTabStateChange((prev) => ({ ...prev, activeResultIndex: index }))
              }
              grid={gridActions}
              exportTriggerRef={exportTriggerRef}
            />
          </div>
        </div>
      </div>

      {/* Save Query Modal */}
      <AnimatePresence>
      {isSaveModalOpen && (
        <Modal>
          <ModalPanel className="bg-popover border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden font-sans text-popover-foreground">
            {/* Modal Header */}
            <div className="p-4 bg-background/60 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm font-mono">
                <Save className="w-4 h-4 text-amber-400" />
                <span>Save SQL Query</span>
              </div>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmSaveQuery} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1 font-mono">
                  Query Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Active Customer Cohort Retention"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1 font-mono">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Used by finance team for monthly MRR calculations"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1 font-mono">
                  Tags & Categories
                </label>

                {/* Suggested Tags Toggles */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {SUGGESTED_TAGS.map((tag) => {
                    const isSelected = saveTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleSaveTag(tag)}
                        className={`pressable px-2 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-500 font-semibold'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Tag Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add custom tag..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSaveTag();
                      }
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddSaveTag}
                    className="pressable px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground border border-border font-mono text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* SQL Code Preview */}
              <div>
                <label className="block text-muted-foreground font-medium mb-1 font-mono">
                  SQL Code Preview
                </label>
                <div className="p-3 bg-background border border-border rounded-lg font-mono text-[11px] text-primary max-h-28 overflow-y-auto whitespace-pre-wrap">
                  {sql}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="pressable px-4 py-2 rounded-lg bg-muted hover:bg-accent text-foreground transition-colors font-mono border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pressable px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-semibold shadow-lg transition-colors font-mono flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Query</span>
                </button>
              </div>
            </form>
          </ModalPanel>
        </Modal>
      )}
      </AnimatePresence>
    </div>
  );
};
