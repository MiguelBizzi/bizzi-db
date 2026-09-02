import React, { useEffect, useState } from 'react';
import { AlertTriangle, Eraser, Trash2, X } from 'lucide-react';
import type { TableSchema } from '../../types';
import {
  buildDropTableSql,
  buildTruncateTableSql,
  canConfirmDelete,
} from '../../lib/schemaChange';

interface ConfirmTableActionModalProps {
  table: TableSchema | null;
  action: 'truncate' | 'drop' | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmTableActionModal: React.FC<ConfirmTableActionModalProps> = ({
  table,
  action,
  onClose,
  onConfirm,
}) => {
  const [typed, setTyped] = useState('');
  const isOpen = Boolean(table && action);

  useEffect(() => {
    if (!isOpen) return;
    setTyped('');
  }, [isOpen, table?.id, action]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!table || !action) return null;

  const isDrop = action === 'drop';
  const sql = isDrop ? buildDropTableSql(table) : buildTruncateTableSql(table);
  const matched = canConfirmDelete(typed, table.name);
  const title = isDrop ? 'Delete table' : 'Empty table';
  const titleId = isDrop ? 'delete-table-title' : 'empty-table-title';
  const Icon = isDrop ? Trash2 : Eraser;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!matched) return;
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <span
              id={titleId}
              className="font-mono text-xs font-bold text-foreground truncate"
            >
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {isDrop ? (
                <>
                  This cannot be undone. Dropping{' '}
                  <span className="font-bold">{table.schema}.{table.name}</span> will
                  permanently delete the table and all of its data.
                </>
              ) : (
                <>
                  Emptying{' '}
                  <span className="font-bold">{table.schema}.{table.name}</span> will
                  remove every row. The table structure is kept.
                </>
              )}
            </span>
          </div>

          <div>
            <label
              htmlFor="confirm-table-action"
              className="block text-[10px] font-bold tracking-wide text-muted-foreground mb-1"
            >
              Type{' '}
              <span className="font-mono text-foreground normal-case">{table.name}</span> to
              confirm
            </label>
            <input
              id="confirm-table-action"
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-3 py-2 bg-background border border-rose-500 rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground outline-none focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-inset focus:ring-rose-500"
            />
          </div>

          <div className="rounded-xl bg-background border border-rose-500/20 p-2.5 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
              SQL preview
            </div>
            <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all">
              {sql}
            </pre>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matched}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{isDrop ? 'Stage delete' : 'Stage empty'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
