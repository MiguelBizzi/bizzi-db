import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Trash2, X } from 'lucide-react';
import type { ColumnDefinition, TableSchema } from '../../types';
import { buildDropColumnSql, canConfirmDelete } from '../../lib/schemaChange';

interface DeleteColumnModalProps {
  isOpen: boolean;
  table: TableSchema;
  column: ColumnDefinition | null;
  disabled?: boolean;
  onClose: () => void;
  onExecute: (sql: string) => Promise<{ error?: string }>;
}

export const DeleteColumnModal: React.FC<DeleteColumnModalProps> = ({
  isOpen,
  table,
  column,
  disabled,
  onClose,
  onExecute,
}) => {
  const [typed, setTyped] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTyped('');
    setSubmitError(null);
    setSubmitting(false);
  }, [isOpen, column?.name]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !column) return null;

  const sql = buildDropColumnSql(table, column.name);
  const matched = canConfirmDelete(typed, column.name);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || disabled || !matched) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await onExecute(sql);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to delete column');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-column-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <span id="delete-column-title" className="font-mono text-xs font-bold text-foreground truncate">
              Delete column
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close delete column"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {submitError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-mono flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{submitError}</span>
            </div>
          )}

          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This cannot be undone. Dropping <span className="font-bold">{column.name}</span> will
              permanently delete that column and all of its data.
            </span>
          </div>

          <div>
            <label
              htmlFor="delete-column-confirm"
              className="block text-[10px] font-bold tracking-wide text-muted-foreground mb-1"
            >
              Type{' '}
              <span className="font-mono text-foreground normal-case">{column.name}</span> to
              confirm
            </label>
            <input
              id="delete-column-confirm"
              type="text"
              value={typed}
              disabled={disabled || submitting}
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
              disabled={!matched || submitting || disabled}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{submitting ? 'Deleting…' : 'Delete column'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
