import { Code, Network, Plus, Table as TableIcon, X } from 'lucide-react';
import type { ShowcaseTab } from './showcaseTabs';

const TABS: {
  id: ShowcaseTab;
  title: string;
  icon: typeof TableIcon;
  iconClass: string;
}[] = [
  { id: 'grid', title: 'users', icon: TableIcon, iconClass: 'text-indigo-400' },
  { id: 'sql', title: 'Query 1', icon: Code, iconClass: 'text-emerald-400' },
  { id: 'erd', title: 'Schema ERD', icon: Network, iconClass: 'text-primary' },
];

export function ShowcaseTabsBar({
  activeTab,
  onSelectTab,
}: {
  activeTab: ShowcaseTab;
  onSelectTab: (tab: ShowcaseTab) => void;
}) {
  return (
    <div className="h-10 bg-background border-b border-border flex items-center px-2 shrink-0">
      <div className="relative flex-1 min-w-0 h-full flex items-center gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium shrink-0 max-w-[200px] ${
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${tab.iconClass}`} />
              <span className="truncate font-mono">{tab.title}</span>
              <span className="p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100">
                <X className="w-3 h-3" />
              </span>
              {active && (
                <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
      <span className="ml-1 p-1.5 rounded-lg bg-muted border border-border text-muted-foreground shrink-0">
        <Plus className="w-3.5 h-3.5" />
      </span>
    </div>
  );
}
