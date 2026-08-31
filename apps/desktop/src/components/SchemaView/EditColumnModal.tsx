import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Pencil, X } from 'lucide-react';
import type { ColumnTypeDef } from '@db/database';
import type { ColumnDefinition, TableSchema } from '../../types';
import {
  alterWarnings,
  buildAlterColumnSql,
  draftFromColumn,
  validateColumnDraft,
  type ColumnDraft,
} from '../../lib/schemaChange';
import { ColumnDraftFields } from './ColumnDraftFields';

interface EditColumnModalProps {
  isOpen: boolean;
  table: TableSchema;
  tables: TableSchema[];
  types: ColumnTypeDef[];
  column: ColumnDefinition | null;
  disabled?: boolean;
  onClose: () => void;
  onExecute: (sql: string) => Promise<{ error?: string }>;
}

export const EditColumnModal: React.FC<EditColumnModalProps> = ({
  isOpen,
  table,
  tables,
  types,
  column,
  disabled,
  onClose,
  onExecute,
}) => {
  const [draft, setDraft] = useState<ColumnDraft>(() =>
    column ? draftFromColumn(column, types) : draftFromColumn({ name: '', type: 'text' }, types)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !column) return;
    setDraft(draftFromColumn(column, types));
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
  }, [isOpen, column]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const sql = useMemo(
    () => (column ? buildAlterColumnSql(table, column, draft, types) : ''),
    [table, column, draft, types]
  );
  const warnings = useMemo(
    () => (column ? alterWarnings(column, draft, types) : []),
    [column, draft, types]
  );
  const valid =
    column != null &&
    Object.keys(
      validateColumnDraft(draft, table, types, { excludeName: column.name, tables })
    ).length === 0;

  if (!isOpen || !column) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || disabled || !sql) return;
    const nextErrors = validateColumnDraft(draft, table, types, {
      excludeName: column.name,
      tables,
    });
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await onExecute(sql);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to update column');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-column-title"
        className="w-full max-w-xl max-h-[90vh] bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="w-4 h-4 text-primary shrink-0" />
            <span id="edit-column-title" className="font-mono text-xs font-bold text-foreground truncate">
              Update column — {column.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close update column"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {submitError && (
          <div className="px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-all">{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-muted">
            <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
              Changing type or tightening nullability can fail if existing rows cannot satisfy the
              new definition. Review the SQL before applying.
            </p>
            {warnings.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] font-mono space-y-1">
                {warnings.map((warning) => (
                  <div key={warning} className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
            <ColumnDraftFields
              draft={draft}
              types={types}
              tables={tables}
              errors={errors}
              disabled={disabled || submitting}
              onChange={(next) => {
                setDraft(next);
                setErrors({});
              }}
            />
          </div>

          <footer className="px-4 py-3 border-t border-border bg-background/60 space-y-2.5 shrink-0">
            <div className="rounded-xl bg-background border border-primary/20 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                SQL preview
              </div>
              <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed max-h-28 overflow-y-auto">
                {sql || 'No changes to apply.'}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || disabled || !valid || !sql}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{submitting ? 'Updating…' : 'Update column'}</span>
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};
