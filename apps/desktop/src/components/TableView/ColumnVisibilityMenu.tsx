import { useEffect, useRef, useState } from 'react';
import { Columns } from 'lucide-react';
import { Checkbox } from '../ui/Checkbox';

interface ColumnVisibilityMenuProps {
  columns: { name: string }[];
  hiddenColumns: string[];
  onHiddenColumnsChange: (hidden: string[]) => void;
  disabled?: boolean;
}

export function ColumnVisibilityMenu({
  columns,
  hiddenColumns,
  onHiddenColumnsChange,
  disabled = false,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hidden = new Set(hiddenColumns);
  const hiddenCount = hiddenColumns.length;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (name: string, visible: boolean) => {
    if (visible) {
      onHiddenColumnsChange(hiddenColumns.filter((column) => column !== name));
    } else {
      onHiddenColumnsChange(hidden.has(name) ? hiddenColumns : [...hiddenColumns, name]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          hiddenCount > 0 || open
            ? 'bg-primary/20 text-primary border-primary/40'
            : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
        }`}
      >
        <Columns className="w-3.5 h-3.5" />
        <span>Hide Columns{hiddenCount > 0 ? ` (${hiddenCount})` : ''}</span>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 min-w-52 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-40 text-xs text-popover-foreground">
          <ul className="max-h-56 overflow-y-auto py-0.5">
            {columns.map((column) => {
              const visible = !hidden.has(column.name);
              return (
                <li key={column.name}>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={visible}
                      onCheckedChange={(checked) => toggle(column.name, checked)}
                      aria-label={`${visible ? 'Hide' : 'Show'} ${column.name}`}
                    />
                    <span className="font-mono truncate">{column.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-border px-1">
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onHiddenColumnsChange(columns.map((column) => column.name))}
            >
              Hide All
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[11px] text-primary hover:bg-accent"
              onClick={() => onHiddenColumnsChange([])}
            >
              Show All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
