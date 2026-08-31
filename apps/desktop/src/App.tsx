import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { TabsBar } from './components/TabsBar';
import { TableDataGrid } from './components/TableView/TableDataGrid';
import { SqlEditorTab } from './components/SqlEditor/SqlEditorTab';
import { InteractiveErd } from './components/SchemaView/InteractiveErd';
import { TableSchemaDesigner } from './components/SchemaView/TableSchemaDesigner';
import { DatabaseMetrics } from './components/MetricsView/DatabaseMetrics';
import { CommandPalette } from './components/CommandPalette';
import { ActivityLogDrawer } from './components/ActivityLog/ActivityLogDrawer';
import { SqlDiffModal } from './components/Modals/SqlDiffModal';
import { ConnectionModal } from './components/Modals/ConnectionModal';
import { ConnectionPicker } from './components/ConnectionPicker';
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

const emptyPending = (): PendingModifications => ({
  updates: [],
  inserts: [],
  deletes: [],
});

export default function App() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [databases, setDatabases] = useState<DatabaseSchema[]>([]);
  const [currentDbId, setCurrentDbId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isSplitView, setIsSplitView] = useState(false);
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
  const [isSqlDiffModalOpen, setIsSqlDiffModalOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

  const skipWorkspaceSave = useRef(true);
  const workspaceRef = useRef<WorkspaceState | null>(null);

  const currentDatabase = currentDbId
    ? databases.find((d) => d.id === currentDbId) || null
    : null;

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

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
        setActiveTabId('');
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
  }, [bootstrapped, tabs, activeTabId, currentDbId]);

  useEffect(() => {
    if (!currentDatabase || currentDatabase.status !== 'connected') return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.type !== 'table_data') return;
    const table = currentDatabase.tables.find(
      (t) => t.id === tab.tableId || t.name === tab.tableName || t.name === tab.title
    );
    if (!table) return;
    tablePreview({
      connectionId: currentDatabase.id,
      schema: table.schema,
      table: table.name,
      limit: DEFAULT_PREVIEW_LIMIT,
      offset: 0,
    })
      .then((res) => {
        setTableRows((prev) => ({
          ...prev,
          [table.id]: (res.rows || []) as Record<string, unknown>[],
        }));
      })
      .catch(() => undefined);
  }, [activeTabId, currentDatabase, tabs]);

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

  const handleSelectTableData = (table: TableSchema) => {
    const existingTab = tabs.find((t) => t.type === 'table_data' && t.tableId === table.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    const newTab: WorkspaceTab = {
      id: 'tab_tbl_' + table.id + '_' + Date.now(),
      type: 'table_data',
      title: table.name,
      tableId: table.id,
      tableName: table.name,
      databaseId: currentDatabase?.id,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleSelectTableSchema = (table: TableSchema) => {
    const existingTab = tabs.find(
      (t) => t.type === 'schema_designer' && t.tableId === table.id
    );
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    const newTab: WorkspaceTab = {
      id: 'tab_schema_' + table.id + '_' + Date.now(),
      type: 'schema_designer',
      title: `${table.name} (Schema)`,
      tableId: table.id,
      databaseId: currentDatabase?.id,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenNewQueryTab = (initialSql?: string) => {
    if (!currentDatabase) return;
    const queryNum = tabs.filter((t) => t.type === 'sql_editor').length + 1;
    const newTab: WorkspaceTab = {
      id: 'tab_sql_' + Date.now(),
      type: 'sql_editor',
      title: `Query ${queryNum}`,
      databaseId: currentDatabase.id,
      sqlContent:
        initialSql ||
        `SELECT * FROM ${currentDatabase.tables[0]?.name || 'pg_catalog.pg_tables'} LIMIT 50;`,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (tabId: string) => {
    const remainingTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(remainingTabs);
    if (activeTabId === tabId) {
      setActiveTabId(remainingTabs[remainingTabs.length - 1]?.id || '');
    }
  };

  const handleReorderTabs = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setTabs((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const updated = [...prev];
      const [movedTab] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedTab);
      return updated;
    });
  };

  const handleDeleteSavedQuery = async (id: string) => {
    await savedQueriesDelete(id);
    setSavedQueries(savedQueries.filter((sq) => sq.id !== id));
  };

  const handleUpdateSavedQueryTags = async (id: string, newTags: string[]) => {
    await savedQueriesUpdateTags(id, newTags);
    setSavedQueries(savedQueries.map((sq) => (sq.id === id ? { ...sq, tags: newTags } : sq)));
  };

  const handleTogglePinTab = (tabId: string) => {
    setTabs(tabs.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t)));
  };

  const getPending = (tableId: string) => pendingByTable[tableId] || emptyPending();

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
    setTabs(tabs.map((t) => (t.id === activeTabId ? { ...t, hasUncommittedChanges: true } : t)));
  };

  const handleRollbackGridChanges = (tableId: string) => {
    setPendingByTable((prev) => ({ ...prev, [tableId]: emptyPending() }));
    setTabs(tabs.map((t) => (t.id === activeTabId ? { ...t, hasUncommittedChanges: false } : t)));
  };

  const handleExportData = (
    table: TableSchema,
    format: 'csv' | 'json' | 'markdown' | 'sql'
  ) => {
    const rows = tableRows[table.id] || [];
    let content = '';
    if (format === 'json') content = JSON.stringify(rows, null, 2);
    else if (format === 'csv') {
      const headers = table.columns.map((c) => c.name).join(',');
      const body = rows
        .map((r) =>
          table.columns
            .map((c) => `"${String(r[c.name] ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      content = `${headers}\n${body}`;
    } else if (format === 'sql') {
      content = rows
        .map((r) => {
          const cols = Object.keys(r);
          const vals = Object.values(r).map((v) => `'${v}'`);
          return `INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
        })
        .join('\n');
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.name}_export.${format}`;
    a.click();
  };

  const openErd = () => {
    const erdTab = tabs.find((t) => t.type === 'erd_schema');
    if (erdTab) {
      setActiveTabId(erdTab.id);
      return;
    }
    const newTab: WorkspaceTab = {
      id: 'tab_erd_' + Date.now(),
      type: 'erd_schema',
      title: 'Schema ERD',
      databaseId: currentDatabase?.id,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const openMetrics = () => {
    const metricsTab = tabs.find((t) => t.type === 'metrics');
    if (metricsTab) {
      setActiveTabId(metricsTab.id);
      return;
    }
    const newTab: WorkspaceTab = {
      id: 'tab_metrics_' + Date.now(),
      type: 'metrics',
      title: 'Health Metrics',
      databaseId: currentDatabase?.id,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
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
          setActiveTabId(preferred);
        } else {
          setTabs([]);
          setActiveTabId('');
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

  const renderTabContent = (tab?: WorkspaceTab) => {
    if (!tab || !currentDatabase) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Database className="w-8 h-8 text-primary opacity-50" />
          <p className="text-sm">Connect a PostgreSQL database to start querying.</p>
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
        return (
          <TableDataGrid
            table={table}
            rows={rows}
            pendingModifications={pending}
            onUpdateCell={(pk, col, oldV, newV) =>
              handleUpdateCell(table.id, pk, col, oldV, newV)
            }
            onInsertRow={() => {
              const newPk = 'row_' + Date.now();
              setPendingByTable((prev) => {
                const pendingNow = prev[table.id] ? { ...prev[table.id] } : emptyPending();
                return {
                  ...prev,
                  [table.id]: {
                    ...pendingNow,
                    inserts: [...pendingNow.inserts, { tempId: newPk, data: { id: newPk } }],
                  },
                };
              });
              setTabs(
                tabs.map((t) =>
                  t.id === tab.id ? { ...t, hasUncommittedChanges: true } : t
                )
              );
            }}
            onDeleteSelectedRows={(pks) => {
              setPendingByTable((prev) => {
                const pendingNow = prev[table.id] ? { ...prev[table.id] } : emptyPending();
                return {
                  ...prev,
                  [table.id]: {
                    ...pendingNow,
                    deletes: [
                      ...pendingNow.deletes,
                      ...pks.map((pk) => ({
                        rowId: pk,
                        primaryKeyValue: pk,
                        rowData: {},
                      })),
                    ],
                  },
                };
              });
              setTabs(
                tabs.map((t) =>
                  t.id === tab.id ? { ...t, hasUncommittedChanges: true } : t
                )
              );
            }}
            onCommitChanges={() => handleRollbackGridChanges(table.id)}
            onRollbackChanges={() => handleRollbackGridChanges(table.id)}
            onOpenSqlDiffModal={() => setIsSqlDiffModalOpen(true)}
            onExport={(fmt) => handleExportData(table, fmt)}
          />
        );
      }
      case 'sql_editor':
        return (
          <SqlEditorTab
            initialSql={tab.sqlContent || tab.sqlQuery}
            currentDatabase={currentDatabase}
            savedQueries={savedQueries}
            onExecuteQuery={async (sql) => {
              const res = await queryExecute({
                connectionId: currentDatabase.id,
                sql,
              });
              await refreshHistory();
              return res;
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
          />
        );
      case 'erd_schema':
        return (
          <InteractiveErd
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
            table={table}
            onSaveSchema={(updated) => {
              setDatabases(
                databases.map((db) =>
                  db.id === currentDbId
                    ? {
                        ...db,
                        tables: db.tables.map((t) => (t.id === updated.id ? updated : t)),
                      }
                    : db
                )
              );
            }}
          />
        );
      }
      case 'metrics':
        return <DatabaseMetrics database={currentDatabase} />;
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
        onSelectDatabase={(id) => {
          void handleOpenConnection(id);
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
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
              onOpenNewQuery={(sql) => handleOpenNewQueryTab(sql)}
              onOpenSchemaDesigner={handleSelectTableSchema}
              onOpenNewTableModal={() => {
                const newTab: WorkspaceTab = {
                  id: 'tab_schema_new_' + Date.now(),
                  type: 'schema_designer',
                  title: 'New Table Schema',
                  databaseId: currentDatabase.id,
                };
                setTabs([...tabs, newTab]);
                setActiveTabId(newTab.id);
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
            <TabsBar
              tabs={tabs}
              activeTabId={activeTabId}
              isSplitView={isSplitView}
              onSelectTab={(id) => setActiveTabId(id)}
              onCloseTab={handleCloseTab}
              onTogglePinTab={handleTogglePinTab}
              onToggleSplitView={() => setIsSplitView(!isSplitView)}
              onOpenNewQueryTab={() => handleOpenNewQueryTab()}
              onOpenErdTab={openErd}
              onOpenMetricsTab={openMetrics}
              onReorderTabs={handleReorderTabs}
            />

            <div className="flex-1 flex h-full overflow-hidden relative">
              {isSplitView ? (
                <div className="grid grid-cols-2 w-full h-full divide-x divide-border">
                  <div className="h-full overflow-hidden">{renderTabContent(activeTab)}</div>
                  <div className="h-full overflow-hidden">
                    {renderTabContent(tabs.find((t) => t.id !== activeTabId) || activeTab)}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full overflow-hidden">{renderTabContent(activeTab)}</div>
              )}
            </div>
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
        onSelectQuery={(sql) => handleOpenNewQueryTab(sql)}
        onOpenErd={openErd}
        onOpenMetrics={openMetrics}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
        onOpenNewQuery={() => handleOpenNewQueryTab()}
        onSelectDatabase={(dbId) => setCurrentDbId(dbId)}
      />

      <ActivityLogDrawer
        logs={activityLogs}
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
      />

      {activeTab?.type === 'table_data' && findTable(activeTab.tableId, activeTab.title) && (
        <SqlDiffModal
          isOpen={isSqlDiffModalOpen}
          tableName={findTable(activeTab.tableId, activeTab.title)?.name || ''}
          modifications={getPending(findTable(activeTab.tableId, activeTab.title)?.id || '')}
          onConfirmCommit={() => {
            const table = findTable(activeTab.tableId, activeTab.title);
            if (table) handleRollbackGridChanges(table.id);
            setIsSqlDiffModalOpen(false);
          }}
          onClose={() => setIsSqlDiffModalOpen(false)}
        />
      )}

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onTest={async (input) => connectionsTest(input)}
        onSave={handleSaveConnection}
      />
    </div>
  );
}
