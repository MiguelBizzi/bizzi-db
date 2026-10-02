import {
  FolderTree,
  Network,
  Plus,
  RefreshCw,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import { PostgresLogo } from '../PostgresLogo';

const TABLES = [
  { schema: 'shop', name: 'organizations', rows: '12 rows', size: '0.08 MB' },
  { schema: 'shop', name: 'users', rows: '1,420 rows', size: '2.14 MB', active: true },
  { schema: 'shop', name: 'products', rows: '340 rows', size: '0.91 MB' },
  { schema: 'shop', name: 'orders', rows: '8,204 rows', size: '11.40 MB' },
  { schema: 'analytics', name: 'events', rows: '54,102 rows', size: '48.22 MB' },
];

export function ShowcaseSidebar({
  onOpenErd,
}: {
  onOpenErd: () => void;
}) {
  return (
    <aside className="w-56 sm:w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full shrink-0 overflow-hidden text-sidebar-foreground">
      <div className="p-3 border-b border-sidebar-border flex flex-col gap-2.5 bg-background/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <FolderTree className="w-3.5 h-3.5 text-primary" />
            <span>Database Explorer</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="p-1 rounded-md bg-muted text-primary border border-sidebar-border">
              <RefreshCw className="w-3.5 h-3.5" />
            </span>
            <span className="p-1 rounded-md bg-muted text-primary border border-sidebar-border">
              <Plus className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
        <div className="relative h-7">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <div className="h-7 w-full pl-8 pr-3 flex items-center bg-background border border-sidebar-border rounded-lg text-xs text-muted-foreground font-mono leading-none whitespace-nowrap overflow-hidden">
            Filter tables & columns...
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto showcase-scroll p-2 space-y-1">
        <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
          <span>Tables & Views (5)</span>
          <PostgresLogo className="w-3.5 h-3.5" />
        </div>
        {TABLES.map((table) => (
          <div
            key={`${table.schema}.${table.name}`}
            className={`rounded-lg border p-2 ${
              table.active
                ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                : 'bg-card/40 border-sidebar-border text-card-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <TableIcon className="w-4 h-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="font-mono text-xs font-medium truncate text-foreground">
                  {table.name}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {table.rows} • {table.size}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-sidebar-border bg-background/50">
        <button
          type="button"
          onClick={onOpenErd}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-colors"
        >
          <Network className="w-4 h-4" />
          <span>Interactive Visual ERD</span>
        </button>
      </div>
    </aside>
  );
}
