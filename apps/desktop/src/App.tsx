import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { WorkspacePanes } from './components/WorkspacePanes';
import { TableDataGrid } from './components/TableView/TableDataGrid';
import { SqlEditorTab } from './components/SqlEditor/SqlEditorTab';
import { InteractiveErd } from './components/SchemaView/InteractiveErd';
import { TableSchemaDesigner } from './components/SchemaView/TableSchemaDesigner';
import { DatabaseMetrics } from './components/MetricsView/DatabaseMetrics';
import { CommandPalette } from './components/CommandPalette';
import { ActivityLogDrawer } from './components/ActivityLog/ActivityLogDrawer';
import { PendingChangesDrawer } from './components/PendingChanges/PendingChangesDrawer';
import { ConnectionModal } from './components/Modals/ConnectionModal';
import { ConnectionPicker } from './components/ConnectionPicker';
import { Toaster } from './components/ui/Toaster';
import {
  DatabaseSchema,
  TableSchema,
  WorkspaceTab,
  SavedQuery,
  ActivityLogItem,
  PendingModifications,
  SaveConnectionInput,
  ConnectionProfile,
  WorkspaceState,
} from './types';
import { DEFAULT_PREVIEW_LIMIT } from '@db/shared';
import {
  connectionsConnect,
  connectionsDelete,
  connectionsDisconnect,
  connectionsList,
  connectionsSave,
  connectionsTest,
  historyList,
  queryExecute,
  schemaIntrospect,
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
import { Database } from 'lucide-react';
import {
  changeKey,
  countPendingChanges,
  emptyPending,
  flattenPending,
  hasPending,
  primaryKeyColumn,
  removeChange,
  sqlForAll,
  sqlForChange,
  type PendingChangeRef,
} from './lib/pendingChanges';
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
import { defaultQuerySql, nextUntitledQueryTitle } from './lib/sqlQuery';

const ROOT_PANE_ID = 'pane_root';

export default function App() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [databases, setDatabases] = useState<DatabaseSchema[]>([]);
  const [currentDbId, setCurrentDbId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [layout, setLayout] = useState<LayoutNode>(() => singlePane([], '', ROOT_PANE_ID));
  const [focusedPaneId, setFocusedPaneId] = useState(ROOT_PANE_ID);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [tableRows, setTableRows] = useState<Record<string, Record<string, unknown>[]>>({});
  const [pendingByTable, setPendingByTable] = useState<Record<string, PendingModifications>>({});
  const [bootstrapped, setBootstrapped] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isPendingChangesOpen, setIsPendingChangesOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [applyingChangeKey, setApplyingChangeKey] = useState<string | null>(null);
  const [applyingAllChanges, setApplyingAllChanges] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const skipWorkspaceSave = useRef(true);
  const workspaceRef = useRef<WorkspaceState | null>(null);
  const tableFetchRef = useRef<Record<string, { limit: number; offset: number }>>({});
  const tableLoadInflight = useRef<Record<string, number>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});

  const currentDatabase = currentDbId
    ? databases.find((d) => d.id === currentDbId) || null
    : null;

  const activePaneId = resolveFocusedPaneId(layout, focusedPaneId);
  const activeTabId = focusedActiveTabId(layout, activePaneId);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const loadTableRows = useCallback(
    async (table: TableSchema, limit: number, offset: number) => {
      if (!currentDatabase) return;
      tableFetchRef.current[table.id] = { limit, offset };
      tableLoadInflight.current[table.id] = (tableLoadInflight.current[table.id] ?? 0) + 1;
      setTableLoading((prev) => ({ ...prev, [table.id]: true }));
      try {
        const res = await tablePreview({
          connectionId: currentDatabase.id,
          schema: table.schema,
          table: table.name,
          limit,
          offset,
        });
        setTableRows((prev) => ({
          ...prev,
          [table.id]: (res.rows || []) as Record<string, unknown>[],
        }));
      } catch {
        setTableRows((prev) => ({
          ...prev,
          [table.id]: prev[table.id] ?? [],
        }));
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
      };
      await loadTableRows(table, params.limit, params.offset);
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

  const loadSchema = useCallback(async (connectionId: string) => {
    const schema = await schemaIntrospect(connectionId);
    setDatabases((prev) => {
      const rest = prev.filter((d) => d.id !== schema.id);
      return [...rest, schema];
    });
    return schema;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listed, workspace, saved, logs] = await Promise.all([
          connectionsList(),
          workspaceLoad(),
          savedQueriesList(),
          historyList(),
        ]);
        if (cancelled) return;
        workspaceRef.current = workspace;
        setProfiles(listed);
        setSavedQueries(saved);
        setActivityLogs(logs);
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

  useEffect(() => {
    if (!bootstrapped || skipWorkspaceSave.current) return;
    const next: WorkspaceState = {
      tabs,
      activeTabId: activeTabId || null,
      currentConnectionId: currentDbId,
    };
    workspaceRef.current = next;
    const handle = window.setTimeout(() => {
      workspaceSave(next).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [bootstrapped, tabs, activeTabId, currentDbId, layout, focusedPaneId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        setIsCommandPaletteOpen((open) => !open);
        return;
      }
      if (key !== 'r') return;
      event.preventDefault();
      event.stopPropagation();
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab || tab.type !== 'table_data' || !currentDatabase) return;
      const table = currentDatabase.tables.find(
        (t) => t.id === tab.tableId || t.name === tab.tableName || t.name === tab.title
      );
      if (!table) return;
      if ((tableLoadInflight.current[table.id] ?? 0) > 0) return;
      void refreshTableRows(table);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeTabId, currentDatabase, tabs, refreshTableRows, layout, focusedPaneId]);

  const pendingCount = useMemo(
    () => countPendingChanges(pendingByTable),
    [pendingByTable]
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

  const syncFocus = (nextLayout: LayoutNode, preferredPaneId: string) => {
    setLayout(nextLayout);
    setFocusedPaneId(resolveFocusedPaneId(nextLayout, preferredPaneId));
  };

  const handleCloseTab = (paneId: string, tabId: string) => {
    if (paneTab(paneId, tabId)?.isPinned) return;
    setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    syncFocus(removeTabFromPane(layout, paneId, tabId), paneId);
  };

  const handleCloseTabs = (paneId: string, tabId: string, kind: CloseTabKind) => {
    const pane = paneById(layout, paneId);
    if (!pane) return;
    const result = closePaneTabs(tabs, pane.tabIds, tabId, kind);
    if (result.removedTabIds.length === 0) return;
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
    setLayout(setPaneActiveTab(layout, paneId, tabId));
    setFocusedPaneId(paneId);
  };

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

  const openPendingChanges = () => {
    setIsActivityLogOpen(false);
    setPendingError(null);
    setIsPendingChangesOpen(true);
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
    const total = countPendingChanges(pendingByTable);
    setPendingByTable({});
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
      const result = res.results[0];
      if (result?.error) {
        setPendingError(result.error);
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
      if (bundle.table) await refreshTableRows(bundle.table);
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
    const sql = sqlForAll(bundles);
    const total = countPendingChanges(pendingByTable);
    if (!sql || total === 0) return;
    setApplyingAllChanges(true);
    setPendingError(null);
    try {
      const res = await queryExecute({ connectionId: currentDatabase.id, sql });
      const result = res.results[0];
      if (result?.error) {
        setPendingError(result.error);
        return;
      }
      setPendingByTable({});
      await Promise.all(
        bundles
          .filter((bundle) => bundle.table)
          .map((bundle) => refreshTableRows(bundle.table as TableSchema))
      );
      await refreshHistory();
      setPendingStatus(`Applied ${total} change${total === 1 ? '' : 's'}`);
    } catch (e: unknown) {
      setPendingError(e instanceof Error ? e.message : 'Failed to apply changes');
    } finally {
      setApplyingAllChanges(false);
    }
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
    async (id: string) => {
      setConnectingId(id);
      setConnectError(null);
      try {
        await connectionsConnect(id);
        const schema = await loadSchema(id);
        setCurrentDbId(schema.id);
        const ws = workspaceRef.current;
        const matchingTabs =
          ws?.tabs.filter((t) => !t.databaseId || t.databaseId === id) || [];
        if (matchingTabs.length > 0) {
          setTabs(matchingTabs);
          const preferred =
            ws?.activeTabId && matchingTabs.some((t) => t.id === ws.activeTabId)
              ? ws.activeTabId
              : matchingTabs[0].id;
          setLayout(singlePane(matchingTabs.map((t) => t.id), preferred, ROOT_PANE_ID));
          setFocusedPaneId(ROOT_PANE_ID);
        } else {
          setTabs([]);
          setLayout(singlePane([], '', ROOT_PANE_ID));
          setFocusedPaneId(ROOT_PANE_ID);
        }
        await refreshHistory();
      } catch (e: unknown) {
        setConnectError(e instanceof Error ? e.message : 'Failed to connect');
      } finally {
        setConnectingId(null);
      }
    },
    [loadSchema, refreshHistory]
  );

  const handleBackToConnections = useCallback(async () => {
    workspaceRef.current = {
      tabs,
      activeTabId: activeTabId || null,
      currentConnectionId: currentDbId,
    };
    if (currentDbId) {
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
      if (currentDbId === id) {
        setCurrentDbId(null);
      }
    },
    [currentDbId]
  );

  const handleSaveConnection = async (input: SaveConnectionInput) => {
    const saved = await connectionsSave(input);
    setProfiles(await connectionsList());
    await handleOpenConnection(saved.id);
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
        const isLoading = Boolean(tableLoading[table.id]) || !(table.id in tableRows);
        return (
          <TableDataGrid
            key={tab.id}
            table={table}
            rows={rows}
            isLoading={isLoading}
            pendingModifications={pending}
            tables={currentDatabase.tables}
            onOpenTable={handleSelectTableData}
            onLookup={async (sql) => {
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
            }}
            onLoadRows={(limit, offset) => loadTableRows(table, limit, offset)}
            onUpdateCell={(pk, col, oldV, newV) =>
              handleUpdateCell(table.id, pk, col, oldV, newV)
            }
            onInsertRow={async (sql) => {
              try {
                const res = await queryExecute({
                  connectionId: currentDatabase.id,
                  sql,
                });
                if (res.results[0]?.error) return { error: res.results[0].error };
                await refreshTableRows(table);
                await refreshHistory();
                return {};
              } catch (e: unknown) {
                return {
                  error: e instanceof Error ? e.message : 'Failed to insert row',
                };
              }
            }}
            onDeleteSelectedRows={(pks) => {
              const rows = tableRows[table.id] || [];
              const pkCol = primaryKeyColumn(table);
              setPendingByTable((prev) => {
                const pendingNow = prev[table.id] ? { ...prev[table.id] } : emptyPending();
                const existing = new Set(
                  pendingNow.deletes.map((row) => String(row.primaryKeyValue))
                );
                const additions = pks
                  .filter((pk) => !existing.has(String(pk)))
                  .map((pk) => {
                    const row = rows.find((candidate) => String(candidate[pkCol]) === String(pk));
                    return {
                      rowId: pk,
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
            }}
          />
        );
      }
      case 'sql_editor':
        return (
          <SqlEditorTab
            key={tab.id}
            initialSql={tab.sqlContent || tab.sqlQuery}
            currentDatabase={currentDatabase}
            savedQueries={savedQueries}
            onExecuteQuery={async (sql) => {
              const res = await queryExecute({
                connectionId: currentDatabase.id,
                sql,
              });
              await refreshHistory();
              return res.results;
            }}
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
            onExecute={async (sql) => {
              const res = await queryExecute({ connectionId: currentDatabase.id, sql });
              if (res.results[0]?.error) return { error: res.results[0].error };
              await loadSchema(currentDatabase.id);
              await refreshHistory();
              return {};
            }}
          />
        );
      }
      case 'metrics':
        return <DatabaseMetrics key={tab.id} database={currentDatabase} />;
      default:
        return null;
    }
  };

  const showPicker = !currentDbId;

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans select-none overflow-hidden">
      <Navbar
        variant={showPicker ? 'picker' : 'workspace'}
        databases={databases}
        currentDatabase={currentDatabase}
        pendingCount={pendingCount}
        onSelectDatabase={(id) => {
          void handleOpenConnection(id);
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenActivityLog={() => {
          setIsPendingChangesOpen(false);
          setIsActivityLogOpen(true);
        }}
        onOpenPendingChanges={openPendingChanges}
        onOpenNewConnection={() => setIsConnectionModalOpen(true)}
        onOpenMetrics={openMetrics}
        onBackToConnections={() => {
          void handleBackToConnections();
        }}
      />

      {showPicker ? (
        <ConnectionPicker
          ready={bootstrapped}
          profiles={profiles}
          connectingId={connectingId}
          connectError={connectError}
          loadError={loadError}
          onSelect={(id) => {
            void handleOpenConnection(id);
          }}
          onDelete={(id) => {
            void handleDeleteConnection(id);
          }}
          onNewConnection={() => setIsConnectionModalOpen(true)}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {currentDatabase ? (
            <Sidebar
              currentDatabase={currentDatabase}
              activeTableId={activeTab?.type === 'table_data' ? activeTab.tableId : undefined}
              onSelectTableData={handleSelectTableData}
              onOpenErd={openErd}
              onOpenSchemaDesigner={handleSelectTableSchema}
              onOpenNewTableModal={() => {
                openTabInPane(activePaneId, {
                  id: 'tab_schema_new_' + Date.now(),
                  type: 'schema_designer',
                  title: 'New Table Schema',
                  databaseId: currentDatabase.id,
                });
              }}
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
        </div>
      )}

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
        onSelectDatabase={(dbId) => setCurrentDbId(dbId)}
      />

      <ActivityLogDrawer
        logs={activityLogs}
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
      />

      <PendingChangesDrawer
        isOpen={isPendingChangesOpen}
        pendingByTable={pendingByTable}
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
      />

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onTest={async (input) => connectionsTest(input)}
        onSave={handleSaveConnection}
      />
      <Toaster />
    </div>
  );
}
