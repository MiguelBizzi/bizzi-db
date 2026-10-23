import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { WorkspacePanes } from './components/WorkspacePanes';
import { TableDataGrid } from './components/TableView/TableDataGrid';
import { SqlEditorTab } from './components/SqlEditor/SqlEditorTab';
import { InteractiveErd } from './components/SchemaView/InteractiveErd';
import { CreateTableDesigner } from './components/SchemaView/CreateTableDesigner';
import { TableSchemaDesigner } from './components/SchemaView/TableSchemaDesigner';
import { RoutineDesigner } from './components/RoutineView/RoutineDesigner';
import { DropRoutineModal } from './components/RoutineView/DropRoutineModal';
import { ViewDesigner } from './components/ViewDesigner/ViewDesigner';
import { ConfirmTableActionModal } from './components/SchemaView/ConfirmTableActionModal';
import { DatabaseMetrics } from './components/MetricsView/DatabaseMetrics';
import { CommandPalette } from './components/CommandPalette';
import { ActivityLogDrawer } from './components/ActivityLog/ActivityLogDrawer';
import { PendingChangesDrawer } from './components/PendingChanges/PendingChangesDrawer';
import { ConnectionModal } from './components/Modals/ConnectionModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ShortcutsModal } from './components/Modals/ShortcutsModal';
import { ConnectionPicker } from './components/ConnectionPicker';
import { Toaster } from './components/ui/Toaster';
import {
  DatabaseSchema,
  RoutineDefinition,
  TableSchema,
  WorkspaceTab,
  SavedQuery,
  ActivityLogItem,
  PendingModifications,
  FilterClause,
  SaveConnectionInput,
  ConnectionProfile,
  ConnectionFolder,
  WorkspaceState,
  AppSettings,
} from './types';
import { ResizeHandles } from './components/ResizeHandles';
import { DEFAULT_APP_SETTINGS, DEFAULT_PREVIEW_LIMIT } from '@db/shared';
import {
  connectionsConnect,
  connectionsDelete,
  connectionsDisconnect,
  connectionsList,
  connectionsMove,
  connectionsSave,
  connectionsTest,
  foldersDelete,
  foldersList,
  foldersSave,
  historyList,
  queryExecute,
  queryPage,
  sqlStatementRanges,
  schemaRoutineSource,
  schemaSync,
  settingsGet,
  settingsSave,
  sshPickPrivateKey,
  tablePreview,
  workspaceLoad,
  workspaceSave,
} from '@db/core';
import {
  savedQueriesDelete,
  savedQueriesList,
  savedQueriesSave,
  savedQueriesUpdateTags,
} from '@db/storage';
import { Database, Loader2 } from 'lucide-react';
import { invokeErrorMessage } from './lib/invokeError';
import { SidebarResizeHandle } from './components/ui/SidebarResizeHandle';
import {
  DEFAULT_SIDEBAR_WIDTH,
  readSidebarCollapsed,
  readSidebarWidth,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from './lib/sidebarLayout';
import { firstExecutionError } from './lib/executionResult';
import { resolveRoutine, routineTabTitle, type RoutineTarget } from './lib/routineTabs';
import { objectDdlFor } from './lib/ddl/registry';
import { planScript } from './lib/ddl/types';
import {
  changeKey,
  countPendingChanges,
  emptyPending,
  flattenPending,
  hasPending,
  pendingConfirmForCommand,
  primaryKeyColumn,
  removeChange,
  rowStatementsForAll,
  sqlForChange,
  stageTableAction,
  type PendingChangeRef,
  type PendingConfirm,
} from './lib/pendingChanges';
import {
  applyAllScripts,
  removeSchemaChange,
  schemaChangeScript,
  routineChangeKey,
  stageSchemaChange,
  stagedFromPlan,
  viewChangeKey,
  type StagedSchemaChange,
} from './lib/schemaQueue';
import {
  addTabToPane,
  collapseEmptyPane,
  focusedActiveTabId,
  nextLayoutId,
  paneById,
  removeTabFromPane,
  reorderPaneTabs,
  replacePane,
  resolveFocusedPaneId,
  resizeSplit,
  setPaneActiveTab,
  singlePane,
  splitPane,
  tabPaneId,
  type LayoutNode,
  type SplitDirection,
  type SplitSide,
} from './lib/workspaceLayout';
import {
  cloneTabForSplit,
  closePaneTabs,
  newSplitTabId,
  renameTab,
  type CloseTabKind,
} from './lib/tabPaneActions';
import { popReopenable, pushClosed, type ClosedTab } from './lib/closedTabs';
import { adjacentTabId, nthTabId } from './lib/tabNavigation';
import { defaultQuerySql, nextUntitledQueryTitle } from './lib/sqlQuery';
import { QUERY_PAGE_SIZE } from './lib/queryPaging';
import { emptySqlTabState, pruneSqlTabState, type SqlTabState } from './lib/sqlTabState';
import { pruneTabFormState } from './lib/tabFormState';
import {
  dropConnectionTabs,
  mergeConnectionTabs,
  restoreConnectionTabs,
} from './lib/connectionWorkspace';
import { refreshConnectionSchemas } from './lib/refreshSchemas';
import {
  createSchemaSyncQueue,
  mergeExplorerTags,
  SCHEMA_CHECK_INTERVAL_MS,
} from './lib/schemaSync';
import { shouldConnectAfterSave } from './lib/connectionForm';
import { toast } from './lib/toast';
import { activeFilters } from './lib/tableFilters';
import { buildTableDdlPreview } from './lib/schemaChange';
import { deriveCommandContext } from './lib/commands/appContext';
import { useAppMenu } from './lib/commands/useAppMenu';
import { buildMenuModel } from './lib/commands/menuModel';
import { adaptMenuModel } from './lib/commands/platformAdapter';
import { currentPlatform } from './lib/commands/shortcutLabel';
import { cheatSheetRows } from './lib/commands/shortcutsCheatSheet';
import { EXTERNAL_LINKS, type ExternalLinkId } from './lib/externalLinks';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  IDLE_UPDATE_STATUS,
  UPDATE_CHECK_INTERVAL_MS,
  canRestartToUpdate,
  manualCheckFeedback,
  canStartUpdateCheck,
  shouldShowUpdateBanner,
  statusAfterCheck,
  statusAfterCheckError,
  statusAfterDownloadComplete,
  statusAfterDownloadEvent,
  statusAfterDownloadFailure,
  statusAfterInstallFailure,
  type AppUpdateStatus,
} from './lib/appUpdate';
import { UpdateBanner } from './components/UpdateBanner';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useMotionPreference } from './lib/motionPreference';

const ROOT_PANE_ID = 'pane_root';
const EMPTY_WORKSPACE: WorkspaceState = {
  tabs: [],
  activeTabId: null,
  currentConnectionId: null,
  activeTabByConnection: {},
};

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [folders, setFolders] = useState<ConnectionFolder[]>([]);
  const [databases, setDatabases] = useState<DatabaseSchema[]>([]);
  const [currentDbId, setCurrentDbId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [layout, setLayout] = useState<LayoutNode>(() => singlePane([], '', ROOT_PANE_ID));
  const [focusedPaneId, setFocusedPaneId] = useState(ROOT_PANE_ID);
  /** Recently closed tabs (newest last) for Reopen Closed Tab. */
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [tableRows, setTableRows] = useState<Record<string, Record<string, unknown>[]>>({});
  /** Rows matching each table's active filters; absent while the table is unfiltered. */
  const [tableMatches, setTableMatches] = useState<Record<string, number | undefined>>({});
  const [pendingByTable, setPendingByTable] = useState<Record<string, PendingModifications>>({});
  /** Staged schema edits and deletes, for every connection; see currentSchemaChanges. */
  const [schemaQueue, setSchemaQueue] = useState<StagedSchemaChange[]>([]);
  const [sqlTabStates, setSqlTabStates] = useState<Record<string, SqlTabState>>({});
  // Bumped per table when its rows change, so open query results can refresh themselves.
  const [dataRevisions, setDataRevisions] = useState<Record<string, number>>({});
  const [bootstrapped, setBootstrapped] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => readSidebarWidth(safeLocalStorage()));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readSidebarCollapsed(safeLocalStorage())
  );
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isPendingChangesOpen, setIsPendingChangesOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [switcherRequest, setSwitcherRequest] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setIsShortcutsOpen(false), []);
  const shortcutGroups = useMemo(() => {
    const platform = currentPlatform();
    return cheatSheetRows(adaptMenuModel(buildMenuModel(), platform), platform);
  }, []);
  const {
    preference: motionPreference,
    reduced: reducedMotion,
    setPreference: setMotionPreference,
  } = useMotionPreference();

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
  }, [reducedMotion]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appVersion, setAppVersion] = useState('0.1.0');
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>(IDLE_UPDATE_STATUS);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const updateStatusRef = useRef<AppUpdateStatus>(IDLE_UPDATE_STATUS);
  const pendingUpdateRef = useRef<Update | null>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(
    null
  );
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);
  const [applyingChangeKey, setApplyingChangeKey] = useState<string | null>(null);
  const [applyingAllChanges, setApplyingAllChanges] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [routineToDrop, setRoutineToDrop] = useState<RoutineDefinition | null>(null);
  const [tableActionConfirm, setTableActionConfirm] = useState<{
    table: TableSchema;
    action: 'truncate' | 'drop';
  } | null>(null);

  const skipWorkspaceSave = useRef(true);
  const workspaceRef = useRef<WorkspaceState | null>(null);
  /** Page each table's rows were last fetched for, so a reopened tab can reuse them. */
  const tableFetchRef = useRef<
    Record<
      string,
      { limit: number; offset: number; connectionId: string; filters: FilterClause[] }
    >
  >({});
  const tableLoadInflight = useRef<Record<string, number>>({});
  /** Latest load per table, so a slow earlier response can't overwrite a newer one. */
  const tableLoadSeq = useRef<Record<string, number>>({});
  const fingerprintByConnection = useRef<Record<string, string>>({});
  const currentDbIdRef = useRef<string | null>(null);
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});

  currentDbIdRef.current = currentDbId;
  updateStatusRef.current = updateStatus;

  const currentDatabase = currentDbId
    ? databases.find((d) => d.id === currentDbId) || null
    : null;

  const activePaneId = resolveFocusedPaneId(layout, focusedPaneId);
  const activeTabId = focusedActiveTabId(layout, activePaneId);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const loadTableRows = useCallback(
    async (table: TableSchema, limit: number, offset: number, filters: FilterClause[] = []) => {
      if (!currentDatabase) return;
      const applied = activeFilters(filters);
      tableFetchRef.current[table.id] = {
        limit,
        offset,
        connectionId: currentDatabase.id,
        filters,
      };
      const seq = (tableLoadSeq.current[table.id] ?? 0) + 1;
      tableLoadSeq.current[table.id] = seq;
      tableLoadInflight.current[table.id] = (tableLoadInflight.current[table.id] ?? 0) + 1;
      setTableLoading((prev) => ({ ...prev, [table.id]: true }));
      try {
        const res = await tablePreview({
          connectionId: currentDatabase.id,
          schema: table.schema,
          table: table.name,
          limit,
          offset,
          ...(applied.length > 0
            ? {
                filters: applied.map(({ column, operator, value }) => ({
                  column,
                  operator,
                  value,
                })),
              }
            : {}),
        });
        if (tableLoadSeq.current[table.id] !== seq) return;
        if (res.error) {
          toast(res.error, 'error');
          return;
        }
        setTableRows((prev) => ({
          ...prev,
          [table.id]: (res.rows || []) as Record<string, unknown>[],
        }));
        setTableMatches((prev) => ({
          ...prev,
          [table.id]: applied.length > 0 ? (res.totalRows ?? undefined) : undefined,
        }));
      } catch (err) {
        if (tableLoadSeq.current[table.id] !== seq) return;
        toast(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        const remaining = (tableLoadInflight.current[table.id] ?? 1) - 1;
        tableLoadInflight.current[table.id] = remaining;
        if (remaining <= 0) {
          setTableLoading((prev) => ({ ...prev, [table.id]: false }));
        }
      }
    },
    [currentDatabase]
  );

  const refreshTableRows = useCallback(
    async (table: TableSchema) => {
      const params = tableFetchRef.current[table.id] || {
        limit: DEFAULT_PREVIEW_LIMIT,
        offset: 0,
        filters: [],
      };
      await loadTableRows(table, params.limit, params.offset, params.filters);
    },
    [loadTableRows]
  );

  const refreshHistory = useCallback(async () => {
    try {
      setActivityLogs(await historyList());
    } catch {
      /* history is best-effort */
    }
  }, []);

  const applySyncedSchema = useCallback((schema: DatabaseSchema) => {
    setDatabases((prev) => {
      const previous = prev.find((d) => d.id === schema.id);
      const merged = mergeExplorerTags(previous, schema);
      return [...prev.filter((d) => d.id !== schema.id), merged];
    });
  }, []);

  const loadSchema = useCallback(
    async (connectionId: string) => {
      const result = await schemaSync({
        connectionId,
        lastFingerprint: fingerprintByConnection.current[connectionId] ?? null,
        force: true,
      });
      fingerprintByConnection.current[connectionId] = result.fingerprint;
      if (!result.schema) {
        throw new Error('Schema refresh returned no schema');
      }
      applySyncedSchema(result.schema);
      return result.schema;
    },
    [applySyncedSchema]
  );

  const checkSchemaFreshness = useCallback(
    async (connectionId: string) => {
      const result = await schemaSync({
        connectionId,
        lastFingerprint: fingerprintByConnection.current[connectionId] ?? null,
        force: false,
      });
      fingerprintByConnection.current[connectionId] = result.fingerprint;
      if (result.schema) applySyncedSchema(result.schema);
    },
    [applySyncedSchema]
  );

  const enqueueSchemaCheck = useMemo(
    () =>
      createSchemaSyncQueue(async () => {
        const id = currentDbIdRef.current;
        if (!id) return;
        try {
          await checkSchemaFreshness(id);
        } catch {
          /* background freshness is best-effort */
        }
      }),
    [checkSchemaFreshness]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listed, listedFolders, workspace, saved, logs, settings] = await Promise.all([
          connectionsList(),
          foldersList(),
          workspaceLoad(),
          savedQueriesList(),
          historyList(),
          settingsGet(),
        ]);
        if (cancelled) return;
        workspaceRef.current = workspace;
        setProfiles(listed);
        setFolders(listedFolders);
        setSavedQueries(saved);
        setActivityLogs(logs);
        setAppSettings(settings);
        setCurrentDbId(null);
        setTabs([]);
        setLayout(singlePane([], '', ROOT_PANE_ID));
        setFocusedPaneId(ROOT_PANE_ID);
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load workspace');
      } finally {
        if (!cancelled) {
          setBootstrapped(true);
          skipWorkspaceSave.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadAppUpdate = useCallback(async (update: Update) => {
    try {
      await update.download((event) => {
        setUpdateStatus((current) => statusAfterDownloadEvent(current, event));
      });
      setUpdateStatus(statusAfterDownloadComplete);
    } catch (error: unknown) {
      console.error('Update download failed', error);
      setUpdateStatus(statusAfterDownloadFailure(error));
    }
  }, []);

  const checkForAppUpdate = useCallback(
    async (): Promise<AppUpdateStatus | null> => {
      if (!canStartUpdateCheck(updateStatusRef.current)) return null;
      setUpdateStatus({ phase: 'checking' });
      try {
        const update = await check();
        if (!update) {
          pendingUpdateRef.current = null;
          const next = statusAfterCheck(null);
          setUpdateStatus(next);
          return next;
        }
        pendingUpdateRef.current = update;
        setUpdateStatus(statusAfterCheck({ version: update.version, body: update.body }));
        await downloadAppUpdate(update);
        return null;
      } catch (error: unknown) {
        console.error('Update check failed', error);
        const next = statusAfterCheckError(error);
        setUpdateStatus(next);
        return next;
      }
    },
    [downloadAppUpdate],
  );

  const checkForAppUpdateManually = useCallback(async () => {
    const result = await checkForAppUpdate();
    const feedback = result ? manualCheckFeedback(result, appVersion) : null;
    if (feedback) toast(feedback.message, feedback.kind);
  }, [appVersion, checkForAppUpdate]);

  const restartToUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!canRestartToUpdate(updateStatusRef.current) || !update) return;
    setUpdateStatus({ phase: 'installing' });
    try {
      await update.install();
      await relaunch();
    } catch (error: unknown) {
      console.error('Update install failed', error);
      setUpdateStatus(statusAfterInstallFailure(error));
    }
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    void getVersion().then(setAppVersion).catch(() => undefined);
    void checkForAppUpdate();
    const timer = window.setInterval(() => {
      void checkForAppUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [bootstrapped, checkForAppUpdate]);

  useEffect(() => {
    if (!bootstrapped || skipWorkspaceSave.current) return;
    const stored = workspaceRef.current ?? EMPTY_WORKSPACE;
    const next: WorkspaceState = currentDbId
      ? {
          ...mergeConnectionTabs(stored, currentDbId, tabs, activeTabId || null),
          activeTabId: activeTabId || null,
          currentConnectionId: currentDbId,
        }
      : { ...stored, currentConnectionId: null };
    workspaceRef.current = next;
    const handle = window.setTimeout(() => {
      workspaceSave(next).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [bootstrapped, tabs, activeTabId, currentDbId, layout, focusedPaneId]);

  useEffect(() => {
    if (!currentDbId) return;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      void enqueueSchemaCheck();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(run, SCHEMA_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [currentDbId, enqueueSchemaCheck]);

  const refreshActiveTable = () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.type !== 'table_data' || !currentDatabase) return;
    const table = currentDatabase.tables.find(
      (t) => t.id === tab.tableId || t.name === tab.tableName || t.name === tab.title
    );
    if (!table) return;
    if ((tableLoadInflight.current[table.id] ?? 0) > 0) return;
    void refreshTableRows(table);
  };

  const currentSchemaChanges = useMemo(
    () => schemaQueue.filter((change) => change.connectionId === currentDatabase?.id),
    [schemaQueue, currentDatabase?.id]
  );

  const stagedKeys = useMemo(
    () => new Set(currentSchemaChanges.map((change) => change.key)),
    [currentSchemaChanges]
  );

  const pendingCount = useMemo(
    () => countPendingChanges(pendingByTable) + currentSchemaChanges.length,
    [pendingByTable, currentSchemaChanges.length]
  );

  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        if (tab.type !== 'table_data' || !tab.tableId) return tab;
        const flag = hasPending(pendingByTable[tab.tableId] || emptyPending());
        if (tab.hasUncommittedChanges === flag) return tab;
        changed = true;
        return { ...tab, hasUncommittedChanges: flag };
      });
      return changed ? next : prev;
    });
  }, [pendingByTable]);

  useEffect(() => {
    if (!pendingStatus) return;
    const timeout = window.setTimeout(() => setPendingStatus(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [pendingStatus]);

  const findTable = (tableId?: string, tableName?: string): TableSchema | undefined => {
    if (!currentDatabase) return undefined;
    if (tableId) {
      const found = currentDatabase.tables.find((t) => t.id === tableId);
      if (found) return found;
    }
    if (tableName) {
      const found = currentDatabase.tables.find((t) => t.name === tableName);
      if (found) return found;
    }
    return undefined;
  };

  const paneTab = (paneId: string, tabId: string) => {
    const pane = paneById(layout, paneId);
    if (!pane?.tabIds.includes(tabId)) return undefined;
    return tabs.find((tab) => tab.id === tabId);
  };

  const openTabInPane = (paneId: string, tab: WorkspaceTab) => {
    const targetId = resolveFocusedPaneId(layout, paneId);
    setTabs((prev) => [...prev, tab]);
    setLayout((prev) => addTabToPane(prev, targetId, tab.id));
    setFocusedPaneId(targetId);
  };

  const revealTabInPane = (
    paneId: string,
    match: (tab: WorkspaceTab) => boolean,
    create: () => WorkspaceTab
  ) => {
    const pane = paneById(layout, paneId);
    const existing = pane
      ? pane.tabIds
          .map((id) => tabs.find((tab) => tab.id === id))
          .find((tab): tab is WorkspaceTab => Boolean(tab && match(tab)))
      : undefined;
    if (existing) {
      setLayout(setPaneActiveTab(layout, paneId, existing.id));
      setFocusedPaneId(paneId);
      return;
    }
    openTabInPane(paneId, create());
  };

  const handleSelectTableData = (table: TableSchema) => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'table_data' && tab.tableId === table.id,
      () => ({
        id: 'tab_tbl_' + table.id + '_' + Date.now(),
        type: 'table_data',
        title: table.name,
        tableId: table.id,
        tableName: table.name,
        databaseId: currentDatabase?.id,
      })
    );
    void enqueueSchemaCheck();
  };

  const handleSelectTableSchema = (table: TableSchema) => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'schema_designer' && tab.tableId === table.id,
      () => ({
        id: 'tab_schema_' + table.id + '_' + Date.now(),
        type: 'schema_designer',
        title: `${table.name} (Schema)`,
        tableId: table.id,
        databaseId: currentDatabase?.id,
      })
    );
    void enqueueSchemaCheck();
  };

  /** The table whose schema tab should open its index editor once. */
  const [newIndexForTableId, setNewIndexForTableId] = useState<string | null>(null);
  const clearNewIndexRequest = useCallback(() => setNewIndexForTableId(null), []);
  const handleNewIndex = (table: TableSchema) => {
    handleSelectTableSchema(table);
    setNewIndexForTableId(table.id);
  };

  /** The routine whose tab should open its editor once. */
  const [editRoutineId, setEditRoutineId] = useState<string | null>(null);
  const clearEditRoutineRequest = useCallback(() => setEditRoutineId(null), []);

  const handleOpenRoutine = (routine: RoutineDefinition, opts?: { edit?: boolean }) => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'function_designer' && tab.routineId === routine.id,
      () => ({
        id: 'tab_routine_' + routine.oid + '_' + Date.now(),
        type: 'function_designer',
        title: routineTabTitle(routine),
        routineId: routine.id,
        databaseId: currentDatabase?.id,
      })
    );
    if (opts?.edit) setEditRoutineId(routine.id);
    void enqueueSchemaCheck();
  };

  const viewTabTitle = (view: { name: string; isMaterialized?: boolean }) =>
    `${view.name} (${view.isMaterialized ? 'Materialized View' : 'View'})`;

  const handleEditView = (view: TableSchema) => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'view_designer' && tab.tableId === view.id,
      () => ({
        id: 'tab_view_' + view.id + '_' + Date.now(),
        type: 'view_designer',
        title: viewTabTitle(view),
        tableId: view.id,
        databaseId: currentDatabase?.id,
      })
    );
    void enqueueSchemaCheck();
  };

  const openNewViewDesigner = () => {
    if (!currentDatabase) return;
    openTabInPane(activePaneId, {
      id: 'tab_view_new_' + Date.now(),
      type: 'view_designer',
      title: 'New View',
      databaseId: currentDatabase.id,
    });
  };

  const handleEditTableOrView = (table: TableSchema) =>
    table.isView ? handleEditView(table) : handleSelectTableSchema(table);

  const openNewRoutineDesigner = () => {
    if (!currentDatabase) return;
    openTabInPane(activePaneId, {
      id: 'tab_routine_new_' + Date.now(),
      type: 'function_designer',
      title: 'New Function',
      databaseId: currentDatabase.id,
    });
  };

  const loadRoutineSource = useCallback(
    (routine: RoutineDefinition) => {
      if (!currentDatabase) return Promise.reject(new Error('Not connected'));
      return schemaRoutineSource({
        connectionId: currentDatabase.id,
        schema: routine.schema,
        oid: routine.oid,
      });
    },
    [currentDatabase?.id]
  );

  const handleCopyRoutineSignature = (routine: RoutineDefinition) => {
    void navigator.clipboard
      .writeText(`${routine.schema}.${routine.name}(${routine.identityArguments})`)
      .then(() => toast.success('Signature copied'))
      .catch(() => toast.error('Could not copy to clipboard'));
  };

  const handleOpenRoutineSql = (routine: RoutineDefinition) => {
    loadRoutineSource(routine)
      .then((source) =>
        handleOpenNewQueryTab(source.definition, activePaneId, `Query · ${routine.name}`)
      )
      .catch((err: unknown) => toast.error(invokeErrorMessage(err, 'Could not load the definition')));
  };

  const handleOpenNewQueryTab = (
    initialSql?: string,
    paneId = activePaneId,
    title?: string
  ) => {
    if (!currentDatabase) return;
    const existingTitles = tabs
      .filter((t) => t.type === 'sql_editor')
      .map((t) => t.title);
    openTabInPane(paneId, {
      id: 'tab_sql_' + Date.now(),
      type: 'sql_editor',
      title: title?.trim() || nextUntitledQueryTitle(existingTitles),
      databaseId: currentDatabase.id,
      sqlContent: initialSql || defaultQuerySql(currentDatabase.tables[0]),
    });
  };

  const handleOpenTableSql = (table: TableSchema) => {
    handleOpenNewQueryTab(defaultQuerySql(table), activePaneId, `Query · ${table.name}`);
  };

  const handleCopyTableSchema = (table: TableSchema) => {
    const ddl = currentDatabase ? objectDdlFor(currentDatabase.dialect) : undefined;
    const viewSql = table.isView && ddl ? ddl.createView(ddl.viewDraftFrom(table)) : undefined;
    void navigator.clipboard
      .writeText(viewSql?.ok ? planScript(viewSql) : buildTableDdlPreview(table))
      .then(() => toast.success(table.isView ? 'View definition copied' : 'Table schema copied'))
      .catch(() => toast.error('Could not copy to clipboard'));
  };

  const handleConfirmTableAction = () => {
    if (!tableActionConfirm) return;
    const { table, action } = tableActionConfirm;
    if (table.isView) {
      const result = currentDatabase && objectDdlFor(currentDatabase.dialect)?.dropView(table);
      if (action === 'drop' && result?.ok) {
        stageSchema(
          stagedFromPlan(result, {
            key: viewChangeKey(table),
            objectKind: 'view',
            action: 'drop',
            schema: table.schema,
            name: table.name,
            title: `Delete ${table.isMaterialized ? 'materialized view' : 'view'} ${table.name}`,
            effects: { closeTableId: table.id },
          })
        );
      }
      setTableActionConfirm(null);
      openPendingChanges();
      return;
    }
    setPendingByTable((prev) => ({
      ...prev,
      [table.id]: stageTableAction(prev[table.id] || emptyPending(), action),
    }));
    setTableActionConfirm(null);
    openPendingChanges();
  };

  const syncFocus = (nextLayout: LayoutNode, preferredPaneId: string) => {
    setLayout(nextLayout);
    setFocusedPaneId(resolveFocusedPaneId(nextLayout, preferredPaneId));
  };

  /** Pushes tabs about to be closed onto the closed-tab stack, with their pane and position. */
  const rememberClosedTabs = (paneId: string, tabIds: string[]) => {
    const pane = paneById(layout, paneId);
    if (!pane) return;
    // Reverse pane order, so repeated reopens restore a batch left to right at its old positions.
    const entries = tabIds
      .map((id) => ({ tab: tabs.find((t) => t.id === id), index: pane.tabIds.indexOf(id) }))
      .filter((e): e is { tab: WorkspaceTab; index: number } => Boolean(e.tab) && e.index >= 0)
      .sort((a, b) => b.index - a.index)
      .map(({ tab, index }) => ({ tab, paneId, index }));
    if (entries.length > 0) setClosedTabs((prev) => pushClosed(prev, entries));
  };

  const handleCloseTab = (paneId: string, tabId: string) => {
    const closing = paneTab(paneId, tabId);
    if (closing?.isPinned) return;
    if (closing) rememberClosedTabs(paneId, [tabId]);
    setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    syncFocus(removeTabFromPane(layout, paneId, tabId), paneId);
  };

  const closeTabsForTables = (tableIds: string[]) => {
    const drop = new Set(tableIds);
    const closeIds = tabs
      .filter(
        (tab) =>
          Boolean(tab.tableId && drop.has(tab.tableId)) &&
          (tab.type === 'table_data' ||
            tab.type === 'schema_designer' ||
            tab.type === 'view_designer')
      )
      .map((tab) => tab.id);
    if (closeIds.length === 0) return;
    const closeSet = new Set(closeIds);
    let nextLayout = layout;
    for (const tabId of closeIds) {
      const paneId = tabPaneId(nextLayout, tabId);
      if (paneId) nextLayout = removeTabFromPane(nextLayout, paneId, tabId);
    }
    setTabs((prev) => prev.filter((tab) => !closeSet.has(tab.id)));
    syncFocus(nextLayout, focusedPaneId);
  };

  const closeTabsForTable = (tableId: string) => closeTabsForTables([tableId]);

  const closeTabsWhere = (predicate: (tab: WorkspaceTab) => boolean) => {
    const closeIds = tabs.filter(predicate).map((tab) => tab.id);
    if (closeIds.length === 0) return;
    const closeSet = new Set(closeIds);
    let nextLayout = layout;
    for (const tabId of closeIds) {
      const paneId = tabPaneId(nextLayout, tabId);
      if (paneId) nextLayout = removeTabFromPane(nextLayout, paneId, tabId);
    }
    setTabs((prev) => prev.filter((tab) => !closeSet.has(tab.id)));
    syncFocus(nextLayout, focusedPaneId);
  };

  const closeTabsForRoutine = (routineId: string) =>
    closeTabsWhere((tab) => tab.type === 'function_designer' && tab.routineId === routineId);

  const handleCloseTabs = (paneId: string, tabId: string, kind: CloseTabKind) => {
    const pane = paneById(layout, paneId);
    if (!pane) return;
    const result = closePaneTabs(tabs, pane.tabIds, tabId, kind);
    if (result.removedTabIds.length === 0) return;
    rememberClosedTabs(paneId, result.removedTabIds);
    const nextActive = result.tabIds.includes(pane.activeTabId)
      ? pane.activeTabId
      : result.tabIds[result.tabIds.length - 1] ?? '';
    const nextLayout = collapseEmptyPane(
      replacePane(layout, paneId, {
        ...pane,
        tabIds: result.tabIds,
        activeTabId: nextActive,
      })
    );
    setTabs(result.tabs);
    syncFocus(nextLayout, paneId);
  };

  const handleReorderTabs = (paneId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setLayout((prev) => reorderPaneTabs(prev, paneId, fromIndex, toIndex));
  };

  const handleRenameTab = (tabId: string, title: string) => {
    setTabs((prev) => renameTab(prev, tabId, title));
  };

  const handleSplitPane = (
    paneId: string,
    tabId: string,
    direction: SplitDirection,
    side: SplitSide
  ) => {
    const source = paneTab(paneId, tabId);
    if (!source) return;
    const clone = cloneTabForSplit(source, newSplitTabId(source));
    const newLeaf = {
      type: 'leaf' as const,
      id: nextLayoutId('pane'),
      tabIds: [clone.id],
      activeTabId: clone.id,
    };
    setTabs((prev) => [...prev, clone]);
    const next = splitPane(layout, paneId, direction, side, newLeaf);
    syncFocus(next, newLeaf.id);
  };

  const handleSelectPaneTab = (paneId: string, tabId: string) => {
    setLayout((prev) => setPaneActiveTab(prev, paneId, tabId));
    setFocusedPaneId(paneId);
  };

  const handleReopenClosedTab = () => {
    const tableIds = new Set(currentDatabase?.tables.map((t) => t.id) ?? []);
    const openIds = new Set(tabs.map((t) => t.id));
    const popped = popReopenable(closedTabs, (tab) => {
      if (!currentDatabase || openIds.has(tab.id)) return false;
      if (tab.databaseId && tab.databaseId !== currentDatabase.id) return false;
      if (tab.type === 'table_data' || tab.type === 'schema_designer') {
        return Boolean(tab.tableId && tableIds.has(tab.tableId));
      }
      if (tab.type === 'view_designer' && tab.tableId) {
        return tableIds.has(tab.tableId);
      }
      if (tab.type === 'function_designer' && tab.routineId) {
        return Boolean(currentDatabase.routines?.some((r) => r.id === tab.routineId));
      }
      return true;
    });
    if (!popped) {
      toast.error('No closed tab to reopen');
      return;
    }
    const { entry, rest } = popped;
    const inOriginalPane = Boolean(paneById(layout, entry.paneId));
    const targetId = inOriginalPane ? entry.paneId : activePaneId;
    setClosedTabs(rest);
    setTabs((prev) => [...prev, entry.tab]);
    setLayout((prev) => {
      const next = addTabToPane(prev, targetId, entry.tab.id);
      const last = (paneById(next, targetId)?.tabIds.length ?? 0) - 1;
      // Back at its old position in its own pane; appended when it lands in another pane.
      return inOriginalPane ? reorderPaneTabs(next, targetId, last, Math.min(entry.index, last)) : next;
    });
    setFocusedPaneId(targetId);
  };

  const selectFocusedPaneTab = (pick: (tabIds: string[], activeId: string) => string | null) => {
    const pane = paneById(layout, activePaneId);
    const id = pane ? pick(pane.tabIds, pane.activeTabId) : null;
    if (id) handleSelectPaneTab(activePaneId, id);
  };

  const toggleSidebar = () => setSidebarCollapsed((collapsed) => !collapsed);
  const updateSidebarWidth = (width: number) => setSidebarWidth(width);

  useEffect(() => {
    writeSidebarCollapsed(safeLocalStorage(), sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Persist once the drag settles rather than on every pointer move.
  useEffect(() => {
    if (!sidebarResizing) writeSidebarWidth(safeLocalStorage(), sidebarWidth);
  }, [sidebarWidth, sidebarResizing]);

  const handleResizeSplit = (splitId: string, sizes: [number, number]) => {
    setLayout((prev) => resizeSplit(prev, splitId, sizes));
  };

  const handleDeleteSavedQuery = async (id: string) => {
    await savedQueriesDelete(id);
    setSavedQueries(savedQueries.filter((sq) => sq.id !== id));
  };

  const handleUpdateSavedQueryTags = async (id: string, newTags: string[]) => {
    await savedQueriesUpdateTags(id, newTags);
    setSavedQueries(savedQueries.map((sq) => (sq.id === id ? { ...sq, tags: newTags } : sq)));
  };

  const getPending = (tableId: string) => pendingByTable[tableId] || emptyPending();

  useEffect(() => {
    // Tabs parked under other connections keep their query results for the session.
    const parked = workspaceRef.current?.tabs ?? [];
    const liveIds = [...tabs, ...parked].map((tab) => tab.id);
    setSqlTabStates((prev) => pruneSqlTabState(prev, liveIds));
    pruneTabFormState(liveIds);
  }, [tabs]);

  const bumpDataRevisions = (tableIds: string[]) => {
    setDataRevisions((prev) => {
      const next = { ...prev };
      for (const id of tableIds) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  };

  const handleSqlChange = (tabId: string, sql: string) => {
    setTabs((prev) => {
      const tab = prev.find((item) => item.id === tabId);
      if (!tab || tab.sqlContent === sql) return prev;
      return prev.map((item) => (item.id === tabId ? { ...item, sqlContent: sql } : item));
    });
  };

  const stageRowDeletes = (
    table: TableSchema,
    pks: unknown[],
    rows: Record<string, unknown>[]
  ) => {
    const pkCol = primaryKeyColumn(table);
    setPendingByTable((prev) => {
      const pendingNow = prev[table.id] ? { ...prev[table.id] } : emptyPending();
      const existing = new Set(pendingNow.deletes.map((row) => String(row.primaryKeyValue)));
      const additions = pks
        .filter((pk) => !existing.has(String(pk)))
        .map((pk) => {
          const row = rows.find((candidate) => String(candidate[pkCol]) === String(pk));
          return {
            rowId: pk as string | number,
            primaryKeyValue: pk,
            rowData: row ? { ...row } : {},
          };
        });
      return {
        ...prev,
        [table.id]: {
          ...pendingNow,
          deletes: [...pendingNow.deletes, ...additions],
        },
      };
    });
  };

  const runLookup = async (sql: string) => {
    if (!currentDatabase) return { rows: [] as Record<string, unknown>[], error: 'Not connected' };
    const res = await queryExecute({
      connectionId: currentDatabase.id,
      sql,
      recordHistory: false,
    });
    const result = res.results[0];
    return {
      rows: (result?.rows || []) as Record<string, unknown>[],
      error: result?.error,
    };
  };

  const insertTableRow = async (table: TableSchema, sql: string): Promise<{ error?: string }> => {
    if (!currentDatabase) return { error: 'Not connected' };
    try {
      const res = await queryExecute({ connectionId: currentDatabase.id, sql });
      const error = firstExecutionError(res.results);
      if (error) return { error };
      await refreshTableRows(table);
      bumpDataRevisions([table.id]);
      await refreshHistory();
      return {};
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Failed to insert row' };
    }
  };

  const openPendingChanges = () => {
    setIsActivityLogOpen(false);
    setPendingError(null);
    setPendingConfirm(null);
    setIsPendingChangesOpen(true);
  };

  /** Commit / Discard from the menu: the drawer opens with that confirmation armed. */
  const openPendingChangesToConfirm = (commandId: string) => {
    if (pendingCount === 0) return;
    openPendingChanges();
    setPendingConfirm(pendingConfirmForCommand(commandId));
  };

  const handleUpdateCell = (
    tableId: string,
    pkValue: unknown,
    colName: string,
    oldVal: unknown,
    newVal: unknown
  ) => {
    setPendingByTable((prev) => {
      const pending = prev[tableId] ? { ...prev[tableId] } : emptyPending();
      const updates = [...pending.updates];
      const existing = updates.findIndex(
        (u) => String(u.primaryKeyValue) === String(pkValue) && u.columnName === colName
      );
      if (existing !== -1) updates[existing] = { ...updates[existing], newValue: newVal };
      else {
        updates.push({
          rowId: String(pkValue),
          primaryKeyValue: pkValue,
          columnName: colName,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
      return { ...prev, [tableId]: { ...pending, updates } };
    });
  };

  const handleCancelChange = (ref: PendingChangeRef) => {
    setPendingByTable((prev) => {
      const current = prev[ref.tableId] || emptyPending();
      const nextMods = removeChange(current, ref);
      if (!hasPending(nextMods)) {
        const { [ref.tableId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [ref.tableId]: nextMods };
    });
    setPendingStatus('Change discarded');
    setPendingError(null);
  };

  const handleCancelAllChanges = () => {
    const total = countPendingChanges(pendingByTable) + currentSchemaChanges.length;
    setPendingByTable({});
    setSchemaQueue((prev) => prev.filter((change) => change.connectionId !== currentDatabase?.id));
    setPendingStatus(total === 0 ? null : `Discarded ${total} change${total === 1 ? '' : 's'}`);
    setPendingError(null);
  };

  const handleApproveChange = async (ref: PendingChangeRef) => {
    if (!currentDatabase) {
      setPendingError('Reconnect to a database to apply changes.');
      return;
    }
    const bundles = flattenPending(pendingByTable, currentDatabase.tables);
    const bundle = bundles.find((item) => item.tableId === ref.tableId);
    if (!bundle) return;
    const sql = sqlForChange(bundle, ref);
    if (!sql) return;
    setApplyingChangeKey(changeKey(ref));
    setPendingError(null);
    try {
      const res = await queryExecute({ connectionId: currentDatabase.id, sql });
      const error = firstExecutionError(res.results);
      if (error) {
        setPendingError(error);
        return;
      }
      setPendingByTable((prev) => {
        const current = prev[ref.tableId] || emptyPending();
        const nextMods = removeChange(current, ref);
        if (!hasPending(nextMods)) {
          const { [ref.tableId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [ref.tableId]: nextMods };
      });
      if (ref.kind === 'drop') {
        closeTabsForTable(ref.tableId);
        await loadSchema(currentDatabase.id);
      } else if (bundle.table) {
        await refreshTableRows(bundle.table);
      }
      bumpDataRevisions([ref.tableId]);
      await refreshHistory();
      setPendingStatus('Change applied');
    } catch (e: unknown) {
      setPendingError(e instanceof Error ? e.message : 'Failed to apply change');
    } finally {
      setApplyingChangeKey(null);
    }
  };

  const handleApproveAllChanges = async () => {
    if (!currentDatabase) {
      setPendingError('Reconnect to a database to apply changes.');
      return;
    }
    const bundles = flattenPending(pendingByTable, currentDatabase.tables);
    const rowSql = rowStatementsForAll(bundles);
    const schemaChanges = currentSchemaChanges;
    const scripts = applyAllScripts(rowSql, schemaChanges);
    const total = countPendingChanges(pendingByTable) + schemaChanges.length;
    if (scripts.length === 0 || total === 0) return;
    const transactional = schemaChanges.filter((change) => change.transactional);
    const separate = schemaChanges.filter((change) => !change.transactional);
    const hasTransaction = Boolean(rowSql.trim()) || transactional.length > 0;
    const applied: StagedSchemaChange[] = [];
    let rowsApplied = false;
    setApplyingAllChanges(true);
    setPendingError(null);
    try {
      let next = 0;
      if (hasTransaction) {
        const res = await queryExecute({ connectionId: currentDatabase.id, sql: scripts[next++] });
        const error = firstExecutionError(res.results);
        if (error) {
          setPendingError(error);
          return;
        }
        rowsApplied = true;
        applied.push(...transactional);
        setPendingByTable({});
        setSchemaQueue((prev) => prev.filter((change) => !transactional.includes(change)));
      }
      for (const change of separate) {
        const res = await queryExecute({ connectionId: currentDatabase.id, sql: scripts[next++] });
        const error = firstExecutionError(res.results);
        if (error) {
          setPendingError(`${change.title}: ${error}`);
          break;
        }
        applied.push(change);
        setSchemaQueue((prev) => prev.filter((entry) => entry !== change));
      }
      const droppedIds = rowsApplied
        ? bundles.filter((bundle) => bundle.tableAction === 'drop').map((bundle) => bundle.tableId)
        : [];
      if (droppedIds.length > 0 || applied.length > 0) {
        const schema = await loadSchema(currentDatabase.id);
        applySchemaEffects(applied, schema, droppedIds);
      }
      if (rowsApplied) {
        await Promise.all(
          bundles
            .filter((bundle) => bundle.table && bundle.tableAction !== 'drop')
            .map((bundle) => refreshTableRows(bundle.table as TableSchema))
        );
        bumpDataRevisions(bundles.map((bundle) => bundle.tableId));
      }
      await refreshHistory();
      const count = (rowsApplied ? countPendingChanges(pendingByTable) : 0) + applied.length;
      if (count > 0) setPendingStatus(`Applied ${count} change${count === 1 ? '' : 's'}`);
    } catch (e: unknown) {
      setPendingError(e instanceof Error ? e.message : 'Failed to apply changes');
    } finally {
      setApplyingAllChanges(false);
    }
  };

  const stageSchema = (change: StagedSchemaChange) => {
    if (!currentDatabase) return;
    const replacing = currentSchemaChanges.some((entry) => entry.key === change.key);
    setSchemaQueue((prev) =>
      stageSchemaChange(
        prev.filter(
          (entry) => !(entry.key === change.key && entry.connectionId !== currentDatabase.id)
        ),
        { ...change, connectionId: currentDatabase.id }
      )
    );
    setPendingError(null);
    setPendingStatus(null);
    toast.success(
      `${replacing ? 'Updated staged change' : 'Staged'}: ${change.title}. Review it in Pending Changes.`
    );
  };

  const applySchemaEffects = (
    changes: StagedSchemaChange[],
    schema: DatabaseSchema,
    droppedTableIds: string[] = []
  ) => {
    const closeTables = new Set(droppedTableIds);
    const closeRoutines = new Set<string>();
    const routineMoves = new Map<string, RoutineDefinition>();
    const tableMoves = new Map<string, string>();
    for (const change of changes) {
      const effects = change.effects;
      if (!effects) continue;
      if (effects.closeTableId) closeTables.add(effects.closeTableId);
      if (effects.closeRoutineId) closeRoutines.add(effects.closeRoutineId);
      if (effects.retargetTable) tableMoves.set(effects.retargetTable.fromId, effects.retargetTable.toId);
      if (effects.retargetRoutine) {
        const routine = resolveRoutine(schema.routines ?? [], effects.retargetRoutine);
        if (routine) routineMoves.set(effects.retargetRoutine.fromId, routine);
      }
    }
    if (routineMoves.size > 0 || tableMoves.size > 0) {
      setTabs((prev) =>
        prev.map((tab) => {
          const routine = tab.routineId ? routineMoves.get(tab.routineId) : undefined;
          if (routine) return { ...tab, routineId: routine.id, title: routineTabTitle(routine) };
          const tableId = tab.tableId ? tableMoves.get(tab.tableId) : undefined;
          if (tableId) return { ...tab, tableId };
          return tab;
        })
      );
    }
    closeTabsWhere(
      (tab) =>
        (Boolean(tab.tableId && closeTables.has(tab.tableId)) &&
          (tab.type === 'table_data' ||
            tab.type === 'schema_designer' ||
            tab.type === 'view_designer')) ||
        (tab.type === 'function_designer' && Boolean(tab.routineId && closeRoutines.has(tab.routineId)))
    );
  };

  const handleApproveSchemaChange = async (key: string) => {
    const change = currentSchemaChanges.find((entry) => entry.key === key);
    if (!currentDatabase || !change) return;
    setApplyingChangeKey(`schema:${key}`);
    setPendingError(null);
    try {
      const res = await queryExecute({
        connectionId: currentDatabase.id,
        sql: schemaChangeScript(change),
      });
      const error = firstExecutionError(res.results);
      if (error) {
        setPendingError(error);
        return;
      }
      setSchemaQueue((prev) => prev.filter((entry) => entry !== change));
      const schema = await loadSchema(currentDatabase.id);
      applySchemaEffects([change], schema);
      await refreshHistory();
      setPendingStatus('Change applied');
    } catch (e: unknown) {
      setPendingError(e instanceof Error ? e.message : 'Failed to apply change');
    } finally {
      setApplyingChangeKey(null);
    }
  };

  const handleCancelSchemaChange = (key: string) => {
    setSchemaQueue((prev) =>
      prev.filter((entry) => !(entry.key === key && entry.connectionId === currentDatabase?.id))
    );
    setPendingStatus('Change discarded');
    setPendingError(null);
  };

  const openErd = () => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'erd_schema',
      () => ({
        id: 'tab_erd_' + Date.now(),
        type: 'erd_schema',
        title: 'Schema ERD',
        databaseId: currentDatabase?.id,
      })
    );
    void enqueueSchemaCheck();
  };

  const openMetrics = () => {
    revealTabInPane(
      activePaneId,
      (tab) => tab.type === 'metrics',
      () => ({
        id: 'tab_metrics_' + Date.now(),
        type: 'metrics',
        title: 'Health Metrics',
        databaseId: currentDatabase?.id,
      })
    );
  };

  const handleOpenConnection = useCallback(
    async (id: string, options?: { reconnect?: boolean }) => {
      if (currentDbId === id && !options?.reconnect) {
        return;
      }
      setConnectingId(id);
      setConnectError(null);
      try {
        if (currentDbId) {
          await connectionsDisconnect(currentDbId).catch(() => undefined);
        }
        await connectionsConnect(id);
        const schema = await loadSchema(id);
        setCurrentDbId(schema.id);
        // Park the connection we are leaving, then restore the target's own workspace.
        let stored = workspaceRef.current ?? EMPTY_WORKSPACE;
        if (currentDbId) {
          stored = mergeConnectionTabs(stored, currentDbId, tabs, activeTabId || null);
        }
        const restored = restoreConnectionTabs(stored, id);
        workspaceRef.current = {
          ...mergeConnectionTabs(stored, id, restored.tabs, restored.activeTabId),
          currentConnectionId: id,
        };
        setTabs(restored.tabs);
        setLayout(
          singlePane(restored.tabs.map((t) => t.id), restored.activeTabId ?? '', ROOT_PANE_ID)
        );
        setFocusedPaneId(ROOT_PANE_ID);
        await refreshHistory();
      } catch (e: unknown) {
        const message = invokeErrorMessage(e, 'Failed to connect');
        setConnectError(message);
        if (currentDbId) toast.error(message);
      } finally {
        setConnectingId(null);
      }
    },
    [activeTabId, currentDbId, loadSchema, refreshHistory, tabs]
  );

  const handleBackToConnections = useCallback(async () => {
    if (currentDbId) {
      workspaceRef.current = {
        ...mergeConnectionTabs(
          workspaceRef.current ?? EMPTY_WORKSPACE,
          currentDbId,
          tabs,
          activeTabId || null
        ),
        currentConnectionId: currentDbId,
      };
      delete fingerprintByConnection.current[currentDbId];
      await connectionsDisconnect(currentDbId).catch(() => undefined);
    }
    setCurrentDbId(null);
    setConnectError(null);
  }, [activeTabId, currentDbId, tabs]);

  const handleDeleteConnection = useCallback(
    async (id: string) => {
      await connectionsDelete(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setDatabases((prev) => prev.filter((d) => d.id !== id));
      delete fingerprintByConnection.current[id];
      if (workspaceRef.current) {
        const next = dropConnectionTabs(workspaceRef.current, id);
        workspaceRef.current = next;
        setSqlTabStates((prev) =>
          pruneSqlTabState(
            prev,
            (currentDbId === id ? next.tabs : [...tabs, ...next.tabs]).map((tab) => tab.id)
          )
        );
        workspaceSave(next).catch(() => undefined);
      }
      if (currentDbId === id) {
        setCurrentDbId(null);
      }
    },
    [currentDbId, tabs]
  );

  const openNewConnection = (folderId?: string | null) => {
    setEditingProfile(null);
    setDefaultFolderId(folderId ?? null);
    setIsConnectionModalOpen(true);
  };

  const openEditConnection = (profile: ConnectionProfile) => {
    setEditingProfile(profile);
    setDefaultFolderId(null);
    setIsConnectionModalOpen(true);
  };

  const reconnectCurrentConnection = () => {
    // Reconnecting the open connection parks and restores its own tabs, so the workspace is kept.
    if (currentDbId) void handleOpenConnection(currentDbId, { reconnect: true });
  };

  const editCurrentConnection = () => {
    const profile = profiles.find((p) => p.id === currentDbId);
    if (profile) openEditConnection(profile);
  };

  const closeConnectionModal = () => {
    setIsConnectionModalOpen(false);
    setEditingProfile(null);
    setDefaultFolderId(null);
  };

  const handleToggleKeychain = async (enabled: boolean) => {
    const saved = await settingsSave({ keychainEnabled: enabled });
    setAppSettings(saved);
  };

  const handleSaveConnection = async (input: SaveConnectionInput) => {
    const saved = await connectionsSave(input);
    setProfiles(await connectionsList());
    if (!shouldConnectAfterSave(input)) {
      toast.success('Connection updated');
      return;
    }
    await handleOpenConnection(saved.id);
  };

  const handleCreateFolder = async (name: string) => {
    const created = await foldersSave({ name });
    setFolders(await foldersList());
    return created;
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await foldersSave({ id, name });
    setFolders(await foldersList());
  };

  const handleDeleteFolder = async (id: string, deleteConnections: boolean) => {
    const memberIds = profiles
      .filter((profile) => profile.folderId === id)
      .map((profile) => profile.id);
    await foldersDelete(id, deleteConnections);
    setFolders(await foldersList());
    setProfiles(await connectionsList());
    if (deleteConnections) {
      setDatabases((prev) => prev.filter((database) => !memberIds.includes(database.id)));
      if (currentDbId && memberIds.includes(currentDbId)) {
        setCurrentDbId(null);
      }
    }
  };

  const handleMoveConnection = async (
    id: string,
    folderId: string | null,
    beforeId?: string | null
  ) => {
    await connectionsMove(id, folderId, beforeId);
    setProfiles(await connectionsList());
  };

  const executeViewCreate = async (
    tabId: string,
    sql: string,
    target: { schema: string; name: string }
  ): Promise<{ error?: string }> => {
    if (!currentDatabase) return { error: 'Not connected' };
    const res = await queryExecute({ connectionId: currentDatabase.id, sql });
    const error = firstExecutionError(res.results);
    if (error) return { error };
    const schema = await loadSchema(currentDatabase.id);
    await refreshHistory();
    const view = schema.tables.find((t) => t.schema === target.schema && t.name === target.name);
    if (view) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId ? { ...tab, tableId: view.id, title: viewTabTitle(view) } : tab
        )
      );
    }
    return {};
  };

  const executeRoutineDdl = async (
    tabId: string,
    sql: string,
    target?: RoutineTarget
  ): Promise<{ error?: string }> => {
    if (!currentDatabase) return { error: 'Not connected' };
    const res = await queryExecute({ connectionId: currentDatabase.id, sql });
    const error = firstExecutionError(res.results);
    if (error) return { error };
    const schema = await loadSchema(currentDatabase.id);
    await refreshHistory();
    const routine = target ? resolveRoutine(schema.routines ?? [], target) : undefined;
    if (routine) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, routineId: routine.id, title: routineTabTitle(routine) }
            : tab
        )
      );
    }
    return {};
  };

  const renderTabContent = (tab: WorkspaceTab) => {
    if (!currentDatabase) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Database className="w-8 h-8 text-primary opacity-50" />
          <p className="text-sm">Loading database schema…</p>
        </div>
      );
    }

    switch (tab.type) {
      case 'table_data': {
        const table = findTable(tab.tableId, tab.title);
        if (!table) {
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Table not found in the current schema.
            </div>
          );
        }
        const rows = tableRows[table.id] || [];
        const pending = getPending(table.id);
        // Rows loaded earlier for this connection are shown as they are; refresh re-fetches.
        const fetched = tableFetchRef.current[table.id];
        const cachedPage =
          fetched && fetched.connectionId === currentDatabase.id && table.id in tableRows
            ? fetched
            : undefined;
        const isLoading = Boolean(tableLoading[table.id]) || !cachedPage;
        return (
          <TableDataGrid
            key={tab.id}
            registerMenuScope
            isFocusedPane={tab.id === activeTabId}
            table={table}
            rows={rows}
            pagination={
              cachedPage
                ? {
                    pageSize: cachedPage.limit,
                    offset: cachedPage.offset,
                    filters: cachedPage.filters,
                  }
                : undefined
            }
            matchCount={tableMatches[table.id]}
            isLoading={isLoading}
            pendingModifications={pending}
            tables={currentDatabase.tables}
            onOpenTable={handleSelectTableData}
            onLookup={runLookup}
            onLoadRows={(limit, offset, filters) => loadTableRows(table, limit, offset, filters)}
            onFetchAllRows={async () => {
              const res = await tablePreview({
                connectionId: currentDatabase.id,
                schema: table.schema,
                table: table.name,
                limit: Number.MAX_SAFE_INTEGER,
                offset: 0,
                filters: activeFilters(tableFetchRef.current[table.id]?.filters ?? []),
              });
              if (res.error) throw new Error(res.error);
              return (res.rows ?? []) as Record<string, unknown>[];
            }}
            onUpdateCell={(pk, col, oldV, newV) =>
              handleUpdateCell(table.id, pk, col, oldV, newV)
            }
            onInsertRow={(sql) => insertTableRow(table, sql)}
            onDeleteSelectedRows={(pks) => stageRowDeletes(table, pks, tableRows[table.id] || [])}
          />
        );
      }
      case 'sql_editor':
        return (
          <SqlEditorTab
            key={tab.id}
            isFocusedPane={tab.id === activeTabId}
            initialSql={tab.sqlContent ?? tab.sqlQuery ?? ''}
            onSqlChange={(sql) => handleSqlChange(tab.id, sql)}
            tabState={sqlTabStates[tab.id] ?? emptySqlTabState()}
            onTabStateChange={(update) =>
              setSqlTabStates((prev) => ({
                ...prev,
                [tab.id]: update(prev[tab.id] ?? emptySqlTabState()),
              }))
            }
            dataRevisions={dataRevisions}
            grid={{
              getPending,
              onUpdateCell: handleUpdateCell,
              onDeleteRows: stageRowDeletes,
              onInsertRow: insertTableRow,
              onLookup: runLookup,
              onOpenTable: handleSelectTableData,
            }}
            currentDatabase={currentDatabase}
            savedQueries={savedQueries}
            onExecuteQuery={async (sql, options) => {
              const res = await queryExecute({
                connectionId: currentDatabase.id,
                sql,
                ...(options?.silent ? { recordHistory: false } : {}),
                ...(options?.unpaged ? {} : { pageSize: QUERY_PAGE_SIZE }),
              });
              if (!options?.silent) {
                await refreshHistory();
                void enqueueSchemaCheck();
              }
              return res.results;
            }}
            onStatementRanges={sqlStatementRanges}
            onQueryPage={(sql, limit, offset, withCount) =>
              queryPage({ connectionId: currentDatabase.id, sql, limit, offset, withCount })
            }
            onBookmarkQuery={async (title, sql, description, tags) => {
              const newSq: SavedQuery = {
                id: 'sq_' + Date.now(),
                title,
                description,
                sql,
                databaseId: currentDatabase.id,
                tags: tags && tags.length > 0 ? tags : ['Analytics'],
                createdAt: new Date().toISOString(),
                isBookmarked: true,
              };
              await savedQueriesSave(newSq);
              setSavedQueries([newSq, ...savedQueries]);
            }}
            onDeleteSavedQuery={handleDeleteSavedQuery}
            onUpdateSavedQueryTags={handleUpdateSavedQueryTags}
            onLoadSavedQuery={(title) => handleRenameTab(tab.id, title)}
          />
        );
      case 'erd_schema':
        return (
          <InteractiveErd
            key={tab.id}
            database={currentDatabase}
            onSelectTableData={handleSelectTableData}
            onSelectTableSchema={handleSelectTableSchema}
          />
        );
      case 'schema_designer': {
        const table = findTable(tab.tableId);
        if (!tab.tableId) {
          return (
            <CreateTableDesigner
              key={tab.id}
              tabId={tab.id}
              tables={currentDatabase.tables}
              dialect={currentDatabase.dialect}
              disabled={currentDatabase.status !== 'connected'}
              onExecute={async (sql) => {
                const res = await queryExecute({ connectionId: currentDatabase.id, sql });
                const error = firstExecutionError(res.results);
                if (error) return { error };
                await loadSchema(currentDatabase.id);
                await refreshHistory();
                return {};
              }}
              onCreated={({ schema, name }) => toast.success(`Table ${schema}.${name} created`)}
            />
          );
        }
        if (!table) {
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a table to inspect its schema.
            </div>
          );
        }
        return (
          <TableSchemaDesigner
            key={tab.id}
            table={table}
            tables={currentDatabase.tables}
            dialect={currentDatabase.dialect}
            disabled={currentDatabase.status !== 'connected'}
            serverVersionNum={currentDatabase.serverVersionNum}
            newIndexRequested={newIndexForTableId === table.id}
            onNewIndexRequestHandled={clearNewIndexRequest}
            onStage={stageSchema}
            stagedKeys={stagedKeys}
            onExecute={async (sql) => {
              const res = await queryExecute({ connectionId: currentDatabase.id, sql });
              const error = firstExecutionError(res.results);
              if (error) return { error };
              await loadSchema(currentDatabase.id);
              await refreshHistory();
              return {};
            }}
          />
        );
      }
      case 'function_designer': {
        const routines = currentDatabase.routines ?? [];
        const routine = tab.routineId
          ? routines.find((entry) => entry.id === tab.routineId)
          : undefined;
        if (tab.routineId && !routine) {
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              This routine no longer exists in the current schema.
            </div>
          );
        }
        const schemas = Array.from(
          new Set([
            ...currentDatabase.tables.map((t) => t.schema),
            ...routines.map((r) => r.schema),
          ])
        ).sort();
        return (
          <RoutineDesigner
            key={tab.id}
            tabId={tab.id}
            routine={routine}
            defaultSchema={schemas.includes('public') ? 'public' : schemas[0] ?? 'public'}
            schemas={schemas}
            languages={currentDatabase.languages ?? []}
            dialect={currentDatabase.dialect}
            disabled={currentDatabase.status !== 'connected'}
            editRequested={Boolean(routine && editRoutineId === routine.id)}
            onEditRequestHandled={clearEditRoutineRequest}
            loadSource={loadRoutineSource}
            onExecute={(sql, target) => executeRoutineDdl(tab.id, sql, target)}
            onOpenSql={(sql, title) => handleOpenNewQueryTab(sql, activePaneId, title)}
            onStage={stageSchema}
            stagedChange={
              routine
                ? currentSchemaChanges.find((change) => change.key === routineChangeKey(routine))
                : undefined
            }
            onOpenPending={openPendingChanges}
          />
        );
      }
      case 'view_designer': {
        const view = tab.tableId
          ? currentDatabase.tables.find((t) => t.id === tab.tableId && t.isView)
          : undefined;
        if (tab.tableId && !view) {
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              This view no longer exists in the current schema.
            </div>
          );
        }
        const schemas = Array.from(
          new Set([
            ...currentDatabase.tables.map((t) => t.schema),
            ...(currentDatabase.routines ?? []).map((r) => r.schema),
          ])
        ).sort();
        return (
          <ViewDesigner
            key={tab.id}
            tabId={tab.id}
            view={view}
            defaultSchema={schemas.includes('public') ? 'public' : schemas[0] ?? 'public'}
            schemas={schemas}
            dialect={currentDatabase.dialect}
            disabled={currentDatabase.status !== 'connected'}
            onExecute={(sql, target) => executeViewCreate(tab.id, sql, target)}
            onStage={stageSchema}
            stagedChange={
              view
                ? currentSchemaChanges.find((change) => change.key === viewChangeKey(view))
                : undefined
            }
            onOpenPending={openPendingChanges}
            onOpenSql={(sql, title) => handleOpenNewQueryTab(sql, activePaneId, title)}
            onDelete={(target) => setTableActionConfirm({ table: target, action: 'drop' })}
          />
        );
      }
      case 'metrics':
        return <DatabaseMetrics key={tab.id} database={currentDatabase} />;
      default:
        return null;
    }
  };

  const paneTabCount = paneById(layout, activePaneId)?.tabIds.length ?? 0;
  const commandContext = useMemo(
    () =>
      deriveCommandContext({
        tabs,
        activeTabId,
        currentDbId,
        pendingCount,
        paneTabCount,
        closedTabCount: closedTabs.length,
        modals: {
          isCommandPaletteOpen,
          isSettingsOpen,
          isShortcutsOpen,
          isConnectionModalOpen,
          isPendingChangesOpen,
          isActivityLogOpen,
          tableActionConfirm: Boolean(tableActionConfirm),
          routineToDrop: Boolean(routineToDrop),
        },
      }),
    [
      tabs,
      activeTabId,
      currentDbId,
      pendingCount,
      paneTabCount,
      closedTabs.length,
      isCommandPaletteOpen,
      isSettingsOpen,
      isShortcutsOpen,
      isConnectionModalOpen,
      isPendingChangesOpen,
      isActivityLogOpen,
      tableActionConfirm,
      routineToDrop,
    ]
  );

  const openNewTableDesigner = () => {
    if (!currentDatabase) return;
    openTabInPane(activePaneId, {
      id: 'tab_schema_new_' + Date.now(),
      type: 'schema_designer',
      title: 'New Table Schema',
      databaseId: currentDatabase.id,
    });
  };

  const refreshSchemas = async () => {
    if (!currentDatabase) return;
    const error = await refreshConnectionSchemas(loadSchema, currentDatabase.id);
    if (error) toast.error(error);
  };

  const openExternalLink = (id: ExternalLinkId) => {
    openUrl(EXTERNAL_LINKS[id]).catch((err: unknown) => toast.error(invokeErrorMessage(err, 'Could not open the link')));
  };

  useAppMenu({
    context: commandContext,
    handlers: {
      'app.settings': () => setIsSettingsOpen(true),
      'app.checkUpdates': checkForAppUpdateManually,
      'file.newQuery': () => handleOpenNewQueryTab(),
      'file.newConnection': () => openNewConnection(),
      'file.newTable': openNewTableDesigner,
      'file.newView': openNewViewDesigner,
      'file.newFunction': openNewRoutineDesigner,
      'file.newIndex': () => {
        const table = activeTab?.tableId ? findTable(activeTab.tableId) : undefined;
        if (!table) return;
        if (table.isView) {
          toast.error('Indexes are added to tables. Open a table to add one.');
          return;
        }
        handleNewIndex(table);
      },
      'file.closeWindow': () => getCurrentWindow().close(),
      'app.quit': () => getCurrentWindow().close(),
      'file.closeTab': () => handleCloseTab(activePaneId, activeTabId),
      'file.closeOthers': () => handleCloseTabs(activePaneId, activeTabId, 'others'),
      'file.closeRight': () => handleCloseTabs(activePaneId, activeTabId, 'right'),
      'file.reopenTab': handleReopenClosedTab,
      'query.review': openPendingChanges,
      // Destructive: they keep the drawer's two-step confirmation, opening it already armed.
      'query.commit': () => openPendingChangesToConfirm('query.commit'),
      'query.discard': () => openPendingChangesToConfirm('query.discard'),
      'conn.switch': () => {
        if (currentDbId) setSwitcherRequest((n) => n + 1);
      },
      'conn.back': () => void handleBackToConnections(),
      'conn.edit': editCurrentConnection,
      'conn.reconnect': reconnectCurrentConnection,
      'conn.disconnect': () => void handleBackToConnections(),
      'conn.refreshSchema': () => void refreshSchemas(),
      'conn.refreshTable': refreshActiveTable,
      'view.palette': () => setIsCommandPaletteOpen((open) => !open),
      'view.toggleSidebar': toggleSidebar,
      'view.erd': openErd,
      'view.metrics': openMetrics,
      'view.activity': () => setIsActivityLogOpen(true),
      'view.nextTab': () => selectFocusedPaneTab((ids, active) => adjacentTabId(ids, active, 1)),
      'view.prevTab': () => selectFocusedPaneTab((ids, active) => adjacentTabId(ids, active, -1)),
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`view.tab.${n}`, () => selectFocusedPaneTab((ids) => nthTabId(ids, n))])
      ),
      'view.splitRight': () => handleSplitPane(activePaneId, activeTabId, 'row', 'after'),
      'view.toggleFullscreen': async () => {
        const win = getCurrentWindow();
        await win.setFullscreen(!(await win.isFullscreen()));
      },
      'view.splitDown': () => handleSplitPane(activePaneId, activeTabId, 'column', 'after'),
      'help.docs': () => openExternalLink('docs'),
      'help.releaseNotes': () => openExternalLink('releaseNotes'),
      'help.reportIssue': () => openExternalLink('reportIssue'),
      'help.shortcuts': () => setIsShortcutsOpen(true),
    },
  });

  const showPicker = !currentDbId;

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
    <ResizeHandles />
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans select-none overflow-hidden">
      <Navbar
        variant={showPicker ? 'picker' : 'workspace'}
        profiles={profiles}
        folders={folders}
        currentDatabase={currentDatabase}
        pendingCount={pendingCount}
        connectingId={connectingId}
        onSelectDatabase={(id) => {
          void handleOpenConnection(id);
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenActivityLog={() => {
          setIsPendingChangesOpen(false);
          setIsActivityLogOpen(true);
        }}
        onOpenPendingChanges={openPendingChanges}
        onOpenNewConnection={openNewConnection}
        onOpenMetrics={openMetrics}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onBackToConnections={() => {
          void handleBackToConnections();
        }}
        switcherRequest={switcherRequest}
      />

      {showPicker ? (
        <ConnectionPicker
          ready={bootstrapped}
          profiles={profiles}
          folders={folders}
          connectingId={connectingId}
          connectError={connectError}
          loadError={loadError}
          onSelect={(id) => {
            void handleOpenConnection(id);
          }}
          onDelete={(id) => {
            void handleDeleteConnection(id);
          }}
          onEdit={openEditConnection}
          onNewConnection={openNewConnection}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={(id, name) => {
            void handleRenameFolder(id, name);
          }}
          onDeleteFolder={(id, deleteConnections) => {
            void handleDeleteFolder(id, deleteConnections);
          }}
          onMoveConnection={(id, folderId, beforeId) => {
            void handleMoveConnection(id, folderId, beforeId);
          }}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {currentDatabase ? (
            <Sidebar
              width={sidebarWidth}
              collapsed={sidebarCollapsed}
              resizing={sidebarResizing}
              onToggleCollapsed={toggleSidebar}
              currentDatabase={currentDatabase}
              activeTableId={activeTab?.type === 'table_data' ? activeTab.tableId : undefined}
              onSelectTableData={handleSelectTableData}
              onOpenErd={openErd}
              onOpenSchemaDesigner={handleEditTableOrView}
              onNewIndex={handleNewIndex}
              onOpenRoutine={handleOpenRoutine}
              onNewRoutine={openNewRoutineDesigner}
              onNewView={openNewViewDesigner}
              routineHandlers={{
                onOpen: handleOpenRoutine,
                onEdit: (routine) => handleOpenRoutine(routine, { edit: true }),
                onOpenSql: handleOpenRoutineSql,
                onCopyName: handleCopyRoutineSignature,
                onDrop: setRoutineToDrop,
              }}
              onOpenTableSql={handleOpenTableSql}
              onCopyTableSchema={handleCopyTableSchema}
              onEmptyTable={(table) => setTableActionConfirm({ table, action: 'truncate' })}
              onDeleteTable={(table) => setTableActionConfirm({ table, action: 'drop' })}
              onOpenNewTableModal={openNewTableDesigner}
              onRefreshSchemas={refreshSchemas}
              onAddTagToTable={(tableName, tag) => {
                setDatabases((prev) =>
                  prev.map((db) =>
                    db.id === currentDatabase.id
                      ? {
                          ...db,
                          tables: db.tables.map((t) =>
                            t.name === tableName ? { ...t, tags: [...t.tags, tag] } : t
                          ),
                        }
                      : db
                  )
                );
              }}
            />
          ) : (
            <aside className="w-64 border-r border-border bg-card" />
          )}
          {currentDatabase && !sidebarCollapsed && (
            <SidebarResizeHandle
              width={sidebarWidth}
              onResize={updateSidebarWidth}
              onReset={() => updateSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              onDragChange={setSidebarResizing}
            />
          )}

          <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
            <WorkspacePanes
              layout={layout}
              tabs={tabs}
              focusedPaneId={activePaneId}
              onFocusPane={setFocusedPaneId}
              onSelectTab={handleSelectPaneTab}
              onCloseTab={handleCloseTab}
              onCloseTabs={handleCloseTabs}
              onRenameTab={handleRenameTab}
              onSplitPane={handleSplitPane}
              onReorderTabs={handleReorderTabs}
              onOpenNewQueryTab={(paneId) => handleOpenNewQueryTab(undefined, paneId)}
              onResizeSplit={handleResizeSplit}
              renderTabContent={renderTabContent}
            />
          </div>

          {connectingId && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
            >
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-lg">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>
                  Connecting to{' '}
                  <span className="font-mono font-semibold">
                    {profiles.find((p) => p.id === connectingId)?.name ?? '…'}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rendered before the palette and settings so they paint on top (equal z-50, no portal). */}
      <ShortcutsModal isOpen={isShortcutsOpen} groups={shortcutGroups} onClose={closeShortcuts} />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        databases={databases}
        currentDatabase={currentDatabase}
        savedQueries={savedQueries}
        onSelectTable={handleSelectTableData}
        onSelectQuery={(sql, title) => handleOpenNewQueryTab(sql, undefined, title)}
        onOpenErd={openErd}
        onOpenMetrics={openMetrics}
        onOpenActivityLog={() => {
          setIsPendingChangesOpen(false);
          setIsActivityLogOpen(true);
        }}
        onOpenPendingChanges={openPendingChanges}
        onOpenNewQuery={() => handleOpenNewQueryTab()}
        onSelectRoutine={(routine) => handleOpenRoutine(routine)}
        onNewRoutine={openNewRoutineDesigner}
        onNewView={openNewViewDesigner}
        onToggleSidebar={currentDatabase ? toggleSidebar : undefined}
        onSelectDatabase={(dbId) => setCurrentDbId(dbId)}
      />

      <ActivityLogDrawer
        logs={activityLogs}
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
      />

      {currentDatabase && (
        <DropRoutineModal
          isOpen={routineToDrop != null}
          dialect={currentDatabase.dialect}
          routine={routineToDrop}
          disabled={currentDatabase.status !== 'connected'}
          onClose={() => setRoutineToDrop(null)}
          onStage={stageSchema}
        />
      )}

      <ConfirmTableActionModal
        table={tableActionConfirm?.table ?? null}
        action={tableActionConfirm?.action ?? null}
        onClose={() => setTableActionConfirm(null)}
        onConfirm={handleConfirmTableAction}
      />

      <PendingChangesDrawer
        isOpen={isPendingChangesOpen}
        pendingByTable={pendingByTable}
        schemaChanges={currentSchemaChanges}
        tables={currentDatabase?.tables || []}
        applyingKey={applyingChangeKey}
        applyingAll={applyingAllChanges}
        statusMessage={pendingStatus}
        errorMessage={pendingError}
        onClose={() => setIsPendingChangesOpen(false)}
        onApprove={(ref) => {
          void handleApproveChange(ref);
        }}
        onCancel={handleCancelChange}
        onApproveAll={() => {
          void handleApproveAllChanges();
        }}
        onCancelAll={handleCancelAllChanges}
        onApproveSchema={(key) => {
          void handleApproveSchemaChange(key);
        }}
        onCancelSchema={handleCancelSchemaChange}
        initialConfirm={pendingConfirm}
      />

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        editingProfile={editingProfile}
        folders={folders}
        defaultFolderId={defaultFolderId}
        keychainEnabled={appSettings.keychainEnabled}
        onClose={closeConnectionModal}
        onTest={async (input) => connectionsTest(input)}
        onSave={handleSaveConnection}
        onEnableKeychain={() => handleToggleKeychain(true)}
        onPickPrivateKey={sshPickPrivateKey}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        keychainEnabled={appSettings.keychainEnabled}
        appVersion={appVersion}
        updateStatus={updateStatus}
        motionPreference={motionPreference}
        onChangeMotionPreference={setMotionPreference}
        onClose={() => setIsSettingsOpen(false)}
        onToggleKeychain={handleToggleKeychain}
        onCheckForUpdates={checkForAppUpdateManually}
        onRestartToUpdate={restartToUpdate}
      />
      <AnimatePresence>
      {shouldShowUpdateBanner(updateStatus, dismissedUpdateVersion) ? (
        <UpdateBanner
          key="update-banner"
          status={updateStatus}
          hasUnsavedChanges={
            Object.values(pendingByTable).some(hasPending) || schemaQueue.length > 0
          }
          onRestart={restartToUpdate}
          onRetry={checkForAppUpdateManually}
          onLater={() => {
            if (updateStatus.phase === 'ready') {
              setDismissedUpdateVersion(updateStatus.version);
            } else {
              setUpdateStatus(IDLE_UPDATE_STATUS);
            }
          }}
        />
      ) : null}
      </AnimatePresence>
      <Toaster />
    </div>
    </MotionConfig>
  );
}
