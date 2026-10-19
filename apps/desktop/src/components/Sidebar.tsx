import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Table as TableIcon,
  Eye,
  Search,
  Plus,
  RefreshCw,
  Network,
  FolderTree,
  ChevronRight,
  EllipsisVertical,
  SquareFunction,
  Workflow,
} from 'lucide-react';
import { DatabaseSchema, RoutineDefinition, TableSchema } from '../types';
import { filterRoutines } from '../lib/routineTabs';
import { routineMenuItems, type RoutineMenuHandlers } from './routineMenu';
import { createMenuItems } from './createMenu';
import { tableStatParts } from '../lib/format';
import { explorerListMode } from '../lib/explorerList';
import { Select } from './ui/Select';
import { ContextMenu } from './ui/ContextMenu';
import { PostgresLogo } from './icons/PostgresLogo';
import {
  tableManagementMenuItems,
  type TableManagementHandlers,
} from './tableManagementMenu';
import { tableMatchesSearch } from '../lib/tableSearch';

const EXPLORER_SKELETON_COUNT = 7;
const EXPLORER_SKELETON_NAME_WIDTHS = [
  'w-[62%]',
  'w-[48%]',
  'w-[70%]',
  'w-[54%]',
  'w-[40%]',
  'w-[58%]',
  'w-[66%]',
];
const EXPLORER_SKELETON_STAT_WIDTHS = [
  'w-[36%]',
  'w-[28%]',
  'w-[44%]',
  'w-[32%]',
  'w-[24%]',
  'w-[40%]',
  'w-[30%]',
];

interface SidebarProps {
  currentDatabase: DatabaseSchema;
  activeTableId?: string;
  onSelectTableData: (table: TableSchema) => void;
  onOpenErd: () => void;
  onOpenSchemaDesigner?: (table: TableSchema) => void;
  onNewIndex?: (table: TableSchema) => void;
  onOpenRoutine?: (routine: RoutineDefinition) => void;
  routineHandlers?: RoutineMenuHandlers;
  onNewRoutine?: () => void;
  onNewView?: () => void;
  onOpenNewTableModal?: () => void;
  onRefreshSchemas?: () => void | Promise<void>;
  onAddTagToTable?: (tableName: string, tag: string) => void;
  onOpenTableSql: (table: TableSchema) => void;
  onCopyTableSchema: (table: TableSchema) => void;
  onEmptyTable: (table: TableSchema) => void;
  onDeleteTable: (table: TableSchema) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentDatabase,
  activeTableId,
  onSelectTableData,
  onOpenErd,
  onOpenSchemaDesigner,
  onNewIndex,
  onOpenRoutine,
  routineHandlers,
  onNewRoutine,
  onNewView,
  onOpenNewTableModal,
  onRefreshSchemas,
  onAddTagToTable,
  onOpenTableSql,
  onCopyTableSchema,
  onEmptyTable,
  onDeleteTable,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingSchemas, setRefreshingSchemas] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [selectedSchema, setSelectedSchema] = useState<string>('ALL');
  const [tagInputTable, setTagInputTable] = useState<string | null>(null);
  const [newTagText, setNewTagText] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; table: TableSchema } | null>(
    null
  );
  const [routineMenu, setRoutineMenu] = useState<{
    x: number;
    y: number;
    routine: RoutineDefinition;
  } | null>(null);
  const [routinesOpen, setRoutinesOpen] = useState(true);
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const routines = currentDatabase.routines ?? [];

  const allTags = Array.from(
    new Set(currentDatabase.tables.flatMap((t) => t.tags))
  );
  const allSchemas = Array.from(
    new Set([...currentDatabase.tables.map((t) => t.schema), ...routines.map((r) => r.schema)])
  );

  const filteredTables = currentDatabase.tables.filter((table) => {
    const matchesSearch = tableMatchesSearch(table.name, searchTerm);
    const matchesTag =
      selectedTag === 'ALL' || table.tags.includes(selectedTag);
    const matchesSchema =
      selectedSchema === 'ALL' || table.schema === selectedSchema;
    return matchesSearch && matchesTag && matchesSchema;
  });
  const listMode = explorerListMode(refreshingSchemas, filteredTables.length);
  const filteredRoutines = filterRoutines(routines, { search: searchTerm, schema: selectedSchema });

  const handleAddTagSubmit = (e: React.FormEvent, tableName: string) => {
    e.preventDefault();
    if (newTagText.trim()) {
      onAddTagToTable?.(tableName, newTagText.trim());
      setNewTagText('');
      setTagInputTable(null);
    }
  };

  const tableHandlers: TableManagementHandlers = {
    onOpen: onSelectTableData,
    onOpenSql: onOpenTableSql,
    onEdit: onOpenSchemaDesigner,
    onNewIndex,
    onCopySchema: onCopyTableSchema,
    onEmpty: onEmptyTable,
    onDelete: onDeleteTable,
  };

  return (
    <aside className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col h-full select-none shrink-0 overflow-hidden text-sidebar-foreground">
      {/* Explorer Top Bar */}
      <div className="p-3 border-b border-sidebar-border flex flex-col gap-2.5 bg-background/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-foreground tracking-wider uppercase">
            <FolderTree className="w-3.5 h-3.5 text-primary" />
            <span>Database Explorer</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (refreshingSchemas) return;
                setRefreshingSchemas(true);
                void Promise.resolve(onRefreshSchemas?.()).finally(() => {
                  setRefreshingSchemas(false);
                });
              }}
              disabled={refreshingSchemas}
              title="Refresh schemas"
              aria-label="Refresh schemas"
              className="p-1 rounded-md bg-muted hover:bg-accent text-primary border border-sidebar-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-muted"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingSchemas ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              title="Create…"
              aria-label="Create a table, view or function"
              aria-haspopup="menu"
              aria-expanded={createMenu != null}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (createMenu) {
                  setCreateMenu(null);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setCreateMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className={`p-1 rounded-md hover:bg-accent text-primary border border-sidebar-border transition-colors ${
                createMenu ? 'bg-accent' : 'bg-muted'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={routines.length > 0 ? 'Filter tables & functions...' : 'Filter tables...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-sidebar-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono transition-all"
          />
        </div>

        {/* Schema selector dropdown if multiple schemas exist */}
        {allSchemas.length > 1 && (
          <Select
            size="sm"
            value={selectedSchema}
            onChange={setSelectedSchema}
            aria-label="Schema"
            options={[
              { value: 'ALL', label: 'All schemas' },
              ...allSchemas.map((sch) => ({ value: sch, label: sch })),
            ]}
          />
        )}

        {/* Tag Filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-always">
            <button
              onClick={() => setSelectedTag('ALL')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0 ${
                selectedTag === 'ALL'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0 flex items-center gap-1 ${
                  selectedTag === tag
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted text-muted-foreground hover:text-foreground border border-sidebar-border'
                }`}
              >
                <span>{tag}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Table Tree List */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        aria-busy={listMode === 'skeleton'}
        aria-label={listMode === 'skeleton' ? 'Loading tables and views' : undefined}
      >
        <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5">
            Tables & Views
            {listMode === 'skeleton' ? (
              <span className="table-skeleton-bar inline-block h-2.5 w-5" />
            ) : (
              <span>({filteredTables.length})</span>
            )}
          </span>
          <PostgresLogo className="w-3.5 h-3.5" />
        </div>

        {listMode === 'skeleton' ? (
          <ExplorerListSkeleton />
        ) : (
          filteredTables.map((table) => {
            const isActive = table.id === activeTableId;
            const stats = tableStatParts(table);
            return (
              <div
                key={table.id}
                className={`group relative rounded-lg border transition-all ${
                  isActive
                    ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                    : 'bg-card/40 border-sidebar-border hover:bg-accent/60 text-card-foreground'
                }`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, table });
                }}
              >
                <div
                  onClick={() => onSelectTableData(table)}
                  className="p-2 pr-8 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {table.isView ? (
                      <Eye className="w-4 h-4 shrink-0 text-amber-400" />
                    ) : (
                      <TableIcon className="w-4 h-4 shrink-0 text-primary" />
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium truncate text-foreground">
                          {table.name}
                        </span>
                        {table.isView && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase font-bold">
                            VIEW
                          </span>
                        )}
                      </div>
                      {stats.length > 0 && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          {stats.join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <RowMenuButton
                  label={`${table.isView ? 'View' : 'Table'} actions for ${table.name}`}
                  open={menu?.table.id === table.id}
                  onOpen={(x, y) => setMenu({ x, y, table })}
                  onClose={() => setMenu(null)}
                />
              </div>
            );
          })
        )}

        {listMode === 'empty' && (
          <div className="text-center py-8 px-4 text-xs text-muted-foreground">
            No tables matching "{searchTerm}"
          </div>
        )}

        {listMode !== 'skeleton' && (routines.length > 0 || onNewRoutine) && (
          <div className="pt-2">
            <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
              <button
                type="button"
                onClick={() => setRoutinesOpen((open) => !open)}
                aria-expanded={routinesOpen}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${routinesOpen ? 'rotate-90' : ''}`}
                />
                Functions
                <span>({filteredRoutines.length})</span>
              </button>
              {onNewRoutine && (
                <button
                  type="button"
                  onClick={onNewRoutine}
                  title="Create New Function"
                  aria-label="Create new function"
                  className="p-0.5 rounded hover:bg-accent text-primary transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
            {routinesOpen && (
              <div className="space-y-1">
                {filteredRoutines.map((routine) => (
                  <div
                    key={routine.id}
                    title={`${routine.schema}.${routine.name}(${routine.identityArguments})`}
                    className="group relative rounded-lg border bg-card/40 border-sidebar-border hover:bg-accent/60 text-card-foreground transition-all"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setRoutineMenu({ x: event.clientX, y: event.clientY, routine });
                    }}
                  >
                    <div
                      onClick={() => onOpenRoutine?.(routine)}
                      className="p-2 pr-8 cursor-pointer flex items-center gap-2.5 min-w-0"
                    >
                      {routine.kind === 'procedure' ? (
                        <Workflow className="w-4 h-4 shrink-0 text-sky-400" />
                      ) : (
                        <SquareFunction className="w-4 h-4 shrink-0 text-sky-400" />
                      )}
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-medium truncate text-foreground">
                          {routine.name}
                          <span className="text-muted-foreground">
                            ({routine.parameters.filter((p) => p.mode !== 'out' && p.mode !== 'table').length})
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {[
                            routine.kind === 'procedure' ? 'procedure' : routine.returnType ?? '',
                            routine.language,
                            selectedSchema === 'ALL' && allSchemas.length > 1 ? routine.schema : '',
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </div>
                    </div>
                    {routineHandlers && (
                      <RowMenuButton
                        label={`${routine.kind === 'procedure' ? 'Procedure' : 'Function'} actions for ${routine.name}`}
                        open={routineMenu?.routine.id === routine.id}
                        onOpen={(x, y) => setRoutineMenu({ x, y, routine })}
                        onClose={() => setRoutineMenu(null)}
                      />
                    )}
                  </div>
                ))}
                {filteredRoutines.length === 0 && (
                  <div className="text-center py-3 px-4 text-[11px] text-muted-foreground">
                    {searchTerm ? `No functions matching "${searchTerm}"` : 'No functions in this schema'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Workspace Action Buttons */}
      <div className="p-2 border-t border-sidebar-border bg-background/50 space-y-1">
        <button
          onClick={onOpenErd}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-colors"
        >
          <Network className="w-4 h-4" />
          <span>Interactive Visual ERD</span>
        </button>
      </div>
      <AnimatePresence>
      {menu && (
        <ContextMenu
          key={`${menu.x}:${menu.y}`}
          x={menu.x}
          y={menu.y}
          items={tableManagementMenuItems(menu.table, tableHandlers)}
          onClose={() => setMenu(null)}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {createMenu && (
        <ContextMenu
          key={`create:${createMenu.x}:${createMenu.y}`}
          x={createMenu.x}
          y={createMenu.y}
          items={createMenuItems({
            onNewTable: onOpenNewTableModal,
            onNewView,
            onNewFunction: onNewRoutine,
          })}
          onClose={() => setCreateMenu(null)}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {routineMenu && routineHandlers && (
        <ContextMenu
          key={`${routineMenu.x}:${routineMenu.y}`}
          x={routineMenu.x}
          y={routineMenu.y}
          items={routineMenuItems(routineMenu.routine, routineHandlers, {
            disabled: currentDatabase.status !== 'connected',
          })}
          onClose={() => setRoutineMenu(null)}
        />
      )}
      </AnimatePresence>
    </aside>
  );
};

function RowMenuButton({
  label,
  open,
  onOpen,
  onClose,
}: {
  label: string;
  open: boolean;
  onOpen: (x: number, y: number) => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      title="More actions"
      // The menu closes on any outside mousedown; keep this one from closing
      // it first so a second click toggles it shut instead of reopening it.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (open) {
          onClose();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
      className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-opacity ${
        open ? 'opacity-100 bg-accent text-foreground' : 'opacity-60 group-hover:opacity-100'
      }`}
    >
      <EllipsisVertical className="w-3.5 h-3.5" />
    </button>
  );
}

function ExplorerListSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: EXPLORER_SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="rounded-lg border border-sidebar-border bg-card/40 p-2 flex items-center gap-2.5"
        >
          <span className="table-skeleton-bar block h-4 w-4 rounded shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
            <span
              className={`table-skeleton-bar block h-3 ${EXPLORER_SKELETON_NAME_WIDTHS[i]}`}
            />
            <span
              className={`table-skeleton-bar block h-2 ${EXPLORER_SKELETON_STAT_WIDTHS[i]}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
