import React, { useState } from 'react';
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

import { MOCK_DATABASES, INITIAL_SAVED_QUERIES, INITIAL_CONNECTIONS } from './data/mockDatabases';
import {
  DatabaseSchema,
  TableSchema,
  WorkspaceTab,
  SavedQuery,
  ActivityLogItem,
  ConnectionProfile,
} from './types';
import { dbEngine } from './services/dbEngine';

const mockDbList = Object.values(MOCK_DATABASES);

export default function App() {
  const [databases, setDatabases] = useState<DatabaseSchema[]>(mockDbList);
  const [currentDbId, setCurrentDbId] = useState<string>(mockDbList[0]?.id || 'ecommerce_prod');

  // Active database reference
  const currentDatabase =
    databases.find((d) => d.id === currentDbId) || databases[0] || mockDbList[0];

  // Workspace Tabs State
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    {
      id: 'tab_users_data',
      type: 'table_data',
      title: 'users',
      tableId: 'users',
      databaseId: mockDbList[0]?.id,
      hasUncommittedChanges: false,
    },
    {
      id: 'tab_sql_1',
      type: 'sql_editor',
      title: 'Query 1',
      databaseId: mockDbList[0]?.id,
      sqlContent:
        'SELECT u.id, u.email, u.full_name, COUNT(o.id) as total_orders, SUM(o.total_amount) as lifetime_value\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nGROUP BY u.id, u.email, u.full_name\nORDER BY lifetime_value DESC\nLIMIT 20;',
    },
    {
      id: 'tab_erd',
      type: 'erd_schema',
      title: 'Schema ERD Diagram',
      databaseId: mockDbList[0]?.id,
      isPinned: true,
    },
  ]);

  const [activeTabId, setActiveTabId] = useState<string>('tab_users_data');
  const [isSplitView, setIsSplitView] = useState<boolean>(false);

  // Saved Queries
  const [savedQueries, setSavedQueries] =
    useState<SavedQuery[]>(INITIAL_SAVED_QUERIES);

  // Modals & Drawers state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isSqlDiffModalOpen, setIsSqlDiffModalOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

  // Activity Log Stream
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>(
    dbEngine.getActivityLogs()
  );

  // Active Tab helper
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Helper to find table by ID or name
  const findTable = (tableId?: string, tableName?: string): TableSchema => {
    if (tableId && currentDatabase?.tables) {
      const found = currentDatabase.tables.find((t) => t.id === tableId);
      if (found) return found;
    }
    if (tableName && currentDatabase?.tables) {
      const found = currentDatabase.tables.find((t) => t.name === tableName);
      if (found) return found;
    }
    return currentDatabase?.tables?.[0] || mockDbList[0].tables[0];
  };

  // Tab operations
  const handleSelectTableData = (table: TableSchema) => {
    const existingTab = tabs.find(
      (t) => t.type === 'table_data' && t.tableId === table.id
    );

    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab: WorkspaceTab = {
        id: 'tab_tbl_' + table.id + '_' + Date.now(),
        type: 'table_data',
        title: table.name,
        tableId: table.id,
        databaseId: currentDatabase.id,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const handleSelectTableSchema = (table: TableSchema) => {
    const existingTab = tabs.find(
      (t) => t.type === 'schema_designer' && t.tableId === table.id
    );

    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab: WorkspaceTab = {
        id: 'tab_schema_' + table.id + '_' + Date.now(),
        type: 'schema_designer',
        title: `${table.name} (Schema)`,
        tableId: table.id,
        databaseId: currentDatabase.id,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const handleOpenNewQueryTab = (initialSql?: string) => {
    const queryNum = tabs.filter((t) => t.type === 'sql_editor').length + 1;
    const newTab: WorkspaceTab = {
      id: 'tab_sql_' + Date.now(),
      type: 'sql_editor',
      title: `Query ${queryNum}`,
      databaseId: currentDatabase.id,
      sqlContent: initialSql || `SELECT * FROM ${currentDatabase.tables[0]?.name || 'users'} LIMIT 50;`,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (tabId: string) => {
    if (tabs.length === 1) return;
    const remainingTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(remainingTabs);
    if (activeTabId === tabId) {
      setActiveTabId(remainingTabs[remainingTabs.length - 1].id);
    }
  };

  const handleReorderTabs = (fromIndex: number, toIndex: number) => {
    const updated = [...tabs];
    const [movedTab] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedTab);
    setTabs(updated);
  };

  const handleDeleteSavedQuery = (id: string) => {
    setSavedQueries(savedQueries.filter((sq) => sq.id !== id));
  };

  const handleUpdateSavedQueryTags = (id: string, newTags: string[]) => {
    setSavedQueries(
      savedQueries.map((sq) => (sq.id === id ? { ...sq, tags: newTags } : sq))
    );
  };

  const handleTogglePinTab = (tabId: string) => {
    setTabs(
      tabs.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    );
  };

  // Data Grid Cell Edit Handler
  const handleUpdateCell = (
    tableName: string,
    pkValue: any,
    colName: string,
    oldVal: any,
    newVal: any
  ) => {
    dbEngine.stageCellUpdate(tableName, pkValue, colName, oldVal, newVal);
    setTabs(
      tabs.map((t) =>
        t.id === activeTabId ? { ...t, hasUncommittedChanges: true } : t
      )
    );
  };

  const handleCommitGridChanges = (tableName: string) => {
    dbEngine.commitModifications(currentDatabase.id, tableName);
    setTabs(
      tabs.map((t) =>
        t.id === activeTabId ? { ...t, hasUncommittedChanges: false } : t
      )
    );
    setActivityLogs(dbEngine.getActivityLogs());
  };

  const handleRollbackGridChanges = (tableName: string) => {
    dbEngine.clearPendingModifications(tableName);
    setTabs(
      tabs.map((t) =>
        t.id === activeTabId ? { ...t, hasUncommittedChanges: false } : t
      )
    );
  };

  // Export Table Data
  const handleExportData = (
    table: TableSchema,
    format: 'csv' | 'json' | 'markdown' | 'sql'
  ) => {
    const rows = dbEngine.getTableRows(table.name);
    let content = '';

    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
    } else if (format === 'csv') {
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

  // Render content of active tab view
  const renderTabContent = (tab: WorkspaceTab) => {
    switch (tab.type) {
      case 'table_data': {
        const table = findTable(tab.tableId, tab.title);
        const rows = dbEngine.getTableRows(table.name);
        const pending = dbEngine.getPendingModifications(table.name);

        return (
          <TableDataGrid
            table={table}
            rows={rows}
            pendingModifications={pending}
            onUpdateCell={(pk, col, oldV, newV) =>
              handleUpdateCell(table.name, pk, col, oldV, newV)
            }
            onInsertRow={() => {
              const newPk = 'usr_' + Date.now().toString().slice(-4);
              dbEngine.stageCellUpdate(table.name, newPk, 'id', null, newPk);
              setTabs(
                tabs.map((t) =>
                  t.id === tab.id ? { ...t, hasUncommittedChanges: true } : t
                )
              );
            }}
            onDeleteSelectedRows={(pks) => {
              pks.forEach((pk) => {
                dbEngine.stageCellUpdate(table.name, pk, 'DELETE_ROW', true, true);
              });
              setTabs(
                tabs.map((t) =>
                  t.id === tab.id ? { ...t, hasUncommittedChanges: true } : t
                )
              );
            }}
            onCommitChanges={() => handleCommitGridChanges(table.name)}
            onRollbackChanges={() => handleRollbackGridChanges(table.name)}
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
              const res = await dbEngine.executeQuery(sql, currentDatabase.id);
              setActivityLogs(dbEngine.getActivityLogs());
              return res;
            }}
            onBookmarkQuery={(title, sql, description, tags) => {
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
        return (
          <TableSchemaDesigner
            table={table}
            onSaveSchema={(updated) => {
              setDatabases(
                databases.map((db) =>
                  db.id === currentDbId
                    ? {
                        ...db,
                        tables: db.tables.map((t) =>
                          t.id === updated.id ? updated : t
                        ),
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

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans select-none overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        databases={databases}
        currentDatabase={currentDatabase}
        connections={INITIAL_CONNECTIONS}
        onSelectDatabase={(id) => setCurrentDbId(id)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenAiAssistant={() => handleOpenNewQueryTab('-- Ask Gemini AI to generate query\n')}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
        onOpenNewConnection={() => setIsConnectionModalOpen(true)}
        onOpenMetrics={() => {
          const metricsTab = tabs.find((t) => t.type === 'metrics');
          if (metricsTab) setActiveTabId(metricsTab.id);
          else {
            const newTab: WorkspaceTab = {
              id: 'tab_metrics_' + Date.now(),
              type: 'metrics',
              title: 'Health Metrics',
              databaseId: currentDatabase.id,
            };
            setTabs([...tabs, newTab]);
            setActiveTabId(newTab.id);
          }
        }}
        isDarkMode={true}
        onToggleTheme={() => {}}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          currentDatabase={currentDatabase}
          activeTableId={activeTab?.type === 'table_data' ? activeTab.tableId : undefined}
          onSelectTableData={handleSelectTableData}
          onOpenErd={() => {
            const erdTab = tabs.find((t) => t.type === 'erd_schema');
            if (erdTab) setActiveTabId(erdTab.id);
            else {
              const newTab: WorkspaceTab = {
                id: 'tab_erd_' + Date.now(),
                type: 'erd_schema',
                title: 'Schema ERD',
                databaseId: currentDatabase.id,
              };
              setTabs([...tabs, newTab]);
              setActiveTabId(newTab.id);
            }
          }}
          onOpenMetrics={() => {
            const metricsTab = tabs.find((t) => t.type === 'metrics');
            if (metricsTab) setActiveTabId(metricsTab.id);
            else {
              const newTab: WorkspaceTab = {
                id: 'tab_metrics_' + Date.now(),
                type: 'metrics',
                title: 'Health Metrics',
                databaseId: currentDatabase.id,
              };
              setTabs([...tabs, newTab]);
              setActiveTabId(newTab.id);
            }
          }}
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
            dbEngine.addTagToTable(currentDatabase.id, tableName, tag);
            setDatabases(dbEngine.getDatabases());
          }}
        />

        {/* Content Region */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          {/* Workspace Tabs Header */}
          <TabsBar
            tabs={tabs}
            activeTabId={activeTabId}
            isSplitView={isSplitView}
            onSelectTab={(id) => setActiveTabId(id)}
            onCloseTab={handleCloseTab}
            onTogglePinTab={handleTogglePinTab}
            onToggleSplitView={() => setIsSplitView(!isSplitView)}
            onOpenNewQueryTab={() => handleOpenNewQueryTab()}
            onOpenErdTab={() => {
              const erdTab = tabs.find((t) => t.type === 'erd_schema');
              if (erdTab) setActiveTabId(erdTab.id);
            }}
            onOpenMetricsTab={() => {
              const metricsTab = tabs.find((t) => t.type === 'metrics');
              if (metricsTab) setActiveTabId(metricsTab.id);
            }}
            onReorderTabs={handleReorderTabs}
          />

          {/* Active Workspace Panes (Single or Split Dual Pane) */}
          <div className="flex-1 flex h-full overflow-hidden relative">
            {isSplitView ? (
              <div className="grid grid-cols-2 w-full h-full divide-x divide-border">
                <div className="h-full overflow-hidden">
                  {renderTabContent(activeTab)}
                </div>
                <div className="h-full overflow-hidden">
                  {/* Secondary pane defaults to SQL Editor or next tab */}
                  {renderTabContent(
                    tabs.find((t) => t.id !== activeTabId) || activeTab
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full h-full overflow-hidden">
                {renderTabContent(activeTab)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette Overlay Modal (Cmd + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        databases={databases}
        currentDatabase={currentDatabase}
        savedQueries={savedQueries}
        onSelectTable={handleSelectTableData}
        onSelectQuery={(sql) => handleOpenNewQueryTab(sql)}
        onOpenErd={() => {
          const erdTab = tabs.find((t) => t.type === 'erd_schema');
          if (erdTab) setActiveTabId(erdTab.id);
          else {
            const newTab: WorkspaceTab = {
              id: 'tab_erd_' + Date.now(),
              type: 'erd_schema',
              title: 'Schema ERD',
              databaseId: currentDatabase.id,
            };
            setTabs([...tabs, newTab]);
            setActiveTabId(newTab.id);
          }
        }}
        onOpenMetrics={() => {
          const metricsTab = tabs.find((t) => t.type === 'metrics');
          if (metricsTab) setActiveTabId(metricsTab.id);
          else {
            const newTab: WorkspaceTab = {
              id: 'tab_metrics_' + Date.now(),
              type: 'metrics',
              title: 'Health Metrics',
              databaseId: currentDatabase.id,
            };
            setTabs([...tabs, newTab]);
            setActiveTabId(newTab.id);
          }
        }}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
        onOpenNewQuery={() => handleOpenNewQueryTab()}
        onSelectDatabase={(dbId) => setCurrentDbId(dbId)}
      />

      {/* Activity Log Drawer */}
      <ActivityLogDrawer
        logs={activityLogs}
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
      />

      {/* SQL Diff Modal */}
      {activeTab?.type === 'table_data' && (
        <SqlDiffModal
          isOpen={isSqlDiffModalOpen}
          tableName={
            findTable(activeTab.tableId, activeTab.title)?.name || ''
          }
          modifications={dbEngine.getPendingModifications(
            findTable(activeTab.tableId, activeTab.title)?.name || ''
          )}
          onConfirmCommit={() =>
            handleCommitGridChanges(
              findTable(activeTab.tableId, activeTab.title)?.name || ''
            )
          }
          onClose={() => setIsSqlDiffModalOpen(false)}
        />
      )}

      {/* Connection Modal */}
      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onAddConnection={(profile) => {
          const newDb: DatabaseSchema = {
            id: profile.id,
            name: profile.name,
            dialect: profile.dialect,
            version: `${profile.dialect} 16.0`,
            connectionHost: profile.host,
            connectionPort: profile.port,
            status: 'connected',
            tables: mockDbList[0].tables, // seed schema
            totalSizeMb: 1240,
            queriesPerSecond: 180,
            activeConnections: 12,
            environment: profile.environment,
          };
          setDatabases([...databases, newDb]);
          setCurrentDbId(newDb.id);
        }}
      />
    </div>
  );
}
