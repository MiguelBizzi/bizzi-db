import React, { useState } from 'react';
import {
  Table as TableIcon,
  Eye,
  Search,
  Plus,
  RefreshCw,
  Network,
  FolderTree,
  Edit3,
} from 'lucide-react';
import { DatabaseSchema, TableSchema } from '../types';
import { tableStatParts } from '../lib/format';
import { explorerListMode } from '../lib/explorerList';
import { Select } from './ui/Select';
import { PostgresLogo } from './icons/PostgresLogo';

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
  onOpenNewTableModal?: () => void;
  onRefreshSchemas?: () => void | Promise<void>;
  onAddTagToTable?: (tableName: string, tag: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentDatabase,
  activeTableId,
  onSelectTableData,
  onOpenErd,
  onOpenSchemaDesigner,
  onOpenNewTableModal,
  onRefreshSchemas,
  onAddTagToTable,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingSchemas, setRefreshingSchemas] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [selectedSchema, setSelectedSchema] = useState<string>('ALL');
  const [tagInputTable, setTagInputTable] = useState<string | null>(null);
  const [newTagText, setNewTagText] = useState('');

  // Collect all unique tags and schemas across tables
  const allTags = Array.from(
    new Set(currentDatabase.tables.flatMap((t) => t.tags))
  );
  const allSchemas = Array.from(
    new Set(currentDatabase.tables.map((t) => t.schema))
  );

  // Filter tables by search, tag, and schema
  const filteredTables = currentDatabase.tables.filter((table) => {
    const matchesSearch =
      table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      table.columns.some((c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    const matchesTag =
      selectedTag === 'ALL' || table.tags.includes(selectedTag);
    const matchesSchema =
      selectedSchema === 'ALL' || table.schema === selectedSchema;
    return matchesSearch && matchesTag && matchesSchema;
  });
  const listMode = explorerListMode(refreshingSchemas, filteredTables.length);

  const handleAddTagSubmit = (e: React.FormEvent, tableName: string) => {
    e.preventDefault();
    if (newTagText.trim()) {
      onAddTagToTable?.(tableName, newTagText.trim());
      setNewTagText('');
      setTagInputTable(null);
    }
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
              onClick={onOpenNewTableModal}
              title="Create New Table"
              className="p-1 rounded-md bg-muted hover:bg-accent text-primary border border-sidebar-border transition-colors"
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
            placeholder="Filter tables & columns..."
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
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
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
        className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-muted"
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
              >
                <div
                  onClick={() => onSelectTableData(table)}
                  className="p-2 cursor-pointer flex items-center justify-between"
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

                  {/* Contextual Action Overlay */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSchemaDesigner?.(table);
                      }}
                      title="Edit Schema Columns"
                      className="p-1 rounded bg-muted hover:bg-accent text-amber-400"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {listMode === 'empty' && (
          <div className="text-center py-8 px-4 text-xs text-muted-foreground">
            No tables matching "{searchTerm}"
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
    </aside>
  );
};

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
