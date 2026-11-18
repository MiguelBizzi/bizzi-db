import type { ReactNode, Ref } from 'react';
import { Braces, ListTree, Play, RefreshCw, TableProperties } from 'lucide-react';
import type { FindInputs } from '../../lib/document/collectionView';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { ShellInput, type ShellInputHandle } from './ShellInput';

export type DocumentViewMode = 'list' | 'json';

interface CollectionToolbarProps {
  draft: FindInputs;
  onDraftChange: (patch: Partial<FindInputs>) => void;
  onApply: () => void;
  filterRef: Ref<ShellInputHandle>;
  viewMode: DocumentViewMode;
  onViewModeChange: (mode: DocumentViewMode) => void;
  fieldsOpen: boolean;
  onToggleFields: () => void;
  onRefresh: () => void;
  loading: boolean;
}

const MODES: { id: DocumentViewMode; label: string; Icon: typeof ListTree }[] = [
  { id: 'list', label: 'List', Icon: ListTree },
  { id: 'json', label: 'JSON', Icon: Braces },
];

interface LabelledProps {
  label: string;
  title?: string;
  children: ReactNode;
  className: string;
}

function Labelled({ label, title, children, className }: LabelledProps) {
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      <span title={title} className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function CollectionToolbar({
  draft,
  onDraftChange,
  onApply,
  filterRef,
  viewMode,
  onViewModeChange,
  fieldsOpen,
  onToggleFields,
  onRefresh,
  loading,
}: CollectionToolbarProps) {
  return (
    <div className="bg-card border-b border-border p-2.5 flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <Labelled label="Filter" title={`Filter Documents (${shortcutLabel('edit.find')})`} className="flex-1">
          <ShellInput
            ref={filterRef}
            value={draft.filter}
            onChange={(filter) => onDraftChange({ filter })}
            onSubmit={onApply}
            placeholder="{ field: value }"
            aria-label="Filter"
            className="flex-1"
          />
        </Labelled>
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          title="Find (Enter)"
          className="pressable shrink-0 flex items-center gap-1.5 px-2.5 h-[30px] rounded-lg bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Find</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Labelled label="Project" className="flex-1 min-w-[12rem]">
          <ShellInput
            value={draft.projection}
            onChange={(projection) => onDraftChange({ projection })}
            onSubmit={onApply}
            placeholder="{ field: 1 }"
            aria-label="Projection"
            className="flex-1"
          />
        </Labelled>
        <Labelled label="Sort" className="flex-1 min-w-[10rem]">
          <ShellInput
            value={draft.sort}
            onChange={(sort) => onDraftChange({ sort })}
            onSubmit={onApply}
            placeholder="{ field: -1 }"
            aria-label="Sort"
            className="flex-1"
          />
        </Labelled>

        <div className="flex items-center gap-2 ml-auto">
          <div role="radiogroup" aria-label="View" className="flex items-center p-0.5 rounded-lg bg-background border border-border">
            {MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={viewMode === id}
                onClick={() => onViewModeChange(id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleFields}
            aria-pressed={fieldsOpen}
            className={`pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              fieldsOpen
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span>Fields</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title={`Refresh Collection (${shortcutLabel('conn.refreshTable')})`}
            aria-label="Refresh Collection"
            className="p-1.5 rounded-lg bg-background border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
