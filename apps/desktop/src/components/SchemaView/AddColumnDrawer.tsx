import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Plus, X } from "lucide-react";
import type { ColumnTypeDef } from "@db/database";
import type { TableSchema } from "../../types";
import {
  buildAddColumnSql,
  emptyColumnDraft,
  validateColumnDraft,
  type ColumnDraft,
} from "../../lib/schemaChange";
import { ColumnDraftFields } from "./ColumnDraftFields";

interface AddColumnDrawerProps {
  isOpen: boolean;
  table: TableSchema;
  tables: TableSchema[];
  types: ColumnTypeDef[];
  disabled?: boolean;
  onClose: () => void;
  onExecute: (sql: string) => Promise<{ error?: string }>;
}

export const AddColumnDrawer: React.FC<AddColumnDrawerProps> = ({
  isOpen,
  table,
  tables,
  types,
  disabled,
  onClose,
  onExecute,
}) => {
  const [draft, setDraft] = useState<ColumnDraft>(emptyColumnDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(emptyColumnDraft());
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [isOpen, table.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const sql = useMemo(
    () => (draft.name.trim() ? buildAddColumnSql(table, draft, types) : ""),
    [table, draft, types],
  );
  const valid =
    Object.keys(validateColumnDraft(draft, table, types, { tables })).length ===
    0;

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || disabled) return;
    const nextErrors = validateColumnDraft(draft, table, types, { tables });
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0 || !sql) return;
    setSubmitting(true);
    try {
      const result = await onExecute(sql);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to add column",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-column-title"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-popover border-l border-border shadow-2xl flex flex-col font-sans text-popover-foreground outline-none"
      >
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Plus className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div
                id="add-column-title"
                className="font-mono text-xs font-bold text-foreground"
              >
                Add column
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {table.schema}.{table.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close add column"
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
          <div className="flex-1 overflow-y-auto p-4">
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
              <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
                {sql || "Fill in the required fields to preview ALTER TABLE."}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 rounded-lg bg-background hover:bg-accent text-foreground border border-border text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || disabled || !valid}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold shadow-md transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{submitting ? "Adding…" : "Add column"}</span>
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  );
};
