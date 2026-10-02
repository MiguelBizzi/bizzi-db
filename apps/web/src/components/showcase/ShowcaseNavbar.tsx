import {
  Activity,
  ChevronDown,
  ListChecks,
  Logs,
  Search,
  Settings,
} from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { PostgresLogo } from '../PostgresLogo';
import { PRODUCT_NAME } from '../../lib/site';

export function ShowcaseNavbar() {
  return (
    <div className="h-13 bg-card border-b border-border text-card-foreground flex items-center justify-between pl-4 pr-3 select-none shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden sm:flex items-center gap-1.5 pr-3">
          <span className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/60" />
          <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/60" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/60" />
        </div>

        <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground pr-3 border-r border-border">
          <BrandMark size="sm" />
          <span>{PRODUCT_NAME}</span>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-medium text-foreground"
          tabIndex={-1}
        >
          <PostgresLogo className="w-4 h-4 shrink-0" />
          <span className="max-w-[140px] truncate font-mono">shop_prod</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          production
        </span>
      </div>

      <div className="hidden md:flex items-center justify-between h-8 w-80 px-3 rounded-lg bg-background border border-border text-muted-foreground text-xs shadow-inner shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate leading-none">Search tables, queries, actions...</span>
        </div>
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded shrink-0">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2">
        <span className="p-2 rounded-lg bg-muted border border-border text-foreground">
          <ListChecks className="w-4 h-4" />
        </span>
        <span className="p-2 rounded-lg bg-muted border border-border">
          <Activity className="w-4 h-4 text-emerald-400" />
        </span>
        <span className="hidden sm:inline p-2 rounded-lg bg-muted border border-border">
          <Logs className="w-4 h-4 text-secondary" />
        </span>
        <span className="p-2 rounded-lg bg-muted border border-border">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </span>
      </div>
    </div>
  );
}
