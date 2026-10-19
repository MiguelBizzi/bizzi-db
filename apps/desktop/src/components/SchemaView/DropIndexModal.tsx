import React, { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { dialectMeta } from "@db/database";
import type { DatabaseDialect, IndexDefinition, TableSchema } from "../../types";
import { OverlayPresence } from "../ui/OverlayPresence";
import { Modal, ModalPanel } from "../ui/Modal";
import { Checkbox } from "../ui/Checkbox";
import { canConfirmDelete } from "../../lib/schemaChange";
import { objectDdlFor } from "../../lib/ddl/registry";
import { planScript } from "../../lib/ddl/types";
import { indexChangeKey, stagedFromPlan, type StagedSchemaChange } from "../../lib/schemaQueue";

interface DropIndexModalProps {
  isOpen: boolean;
  table: TableSchema;
  dialect: DatabaseDialect;
  index: IndexDefinition | null;
  disabled?: boolean;
  onClose: () => void;
  onStage: (change: StagedSchemaChange) => void;
}

const DropIndexModalBody: React.FC<DropIndexModalProps> = ({
  isOpen,
  table,
  dialect,
  index,
  disabled,
  onClose,
  onStage,
}) => {
  const [typed, setTyped] = useState("");
  const [concurrently, setConcurrently] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTyped("");
    setConcurrently(false);
  }, [isOpen, index?.name]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const ddl = objectDdlFor(dialect);
  if (!isOpen || !index || !ddl) return null;

  const supportsConcurrent = Boolean(dialectMeta(dialect)?.objects.indexes.concurrent);
  const result = ddl.dropIndex(index, table, { concurrently });
  const sql = result.ok ? planScript(result) : "";
  const matched = canConfirmDelete(typed, index.name);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !matched || !result.ok) return;
    onStage(
      stagedFromPlan(result, {
        key: indexChangeKey(table, index.name),
        objectKind: "index",
        action: "drop",
        schema: table.schema,
        name: index.name,
        parent: `${table.schema}.${table.name}`,
        title: `Delete index ${index.name}`,
      }),
    );
    onClose();
  };

  return (
    <Modal>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-index-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <span id="drop-index-title" className="font-mono text-xs font-bold text-foreground truncate">
              Delete index
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close delete index"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {!result.ok ? (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{result.reason}</span>
            </div>
          ) : (
            <>
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Queries that rely on <span className="font-bold">{index.name}</span> may become
                  much slower. Data is not affected, and the index can be rebuilt later.
                </span>
              </div>

              <div>
                <label
                  htmlFor="drop-index-confirm"
                  className="block text-[10px] font-bold tracking-wide text-muted-foreground mb-1"
                >
                  Type <span className="font-mono text-foreground normal-case">{index.name}</span> to
                  confirm
                </label>
                <input
                  id="drop-index-confirm"
                  type="text"
                  value={typed}
                  disabled={disabled}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-rose-500 rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground outline-none focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-inset focus:ring-rose-500"
                />
              </div>

              {supportsConcurrent && (
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <span className="mt-0.5">
                    <Checkbox
                      checked={concurrently}
                      onCheckedChange={setConcurrently}
                      aria-label="Drop concurrently"
                    />
                  </span>
                  <span>
                    <span className="font-mono">CONCURRENTLY</span>
                    <span className="block text-[10px] text-muted-foreground">
                      Don't block queries on the table while dropping.
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-xl bg-background border border-rose-500/20 p-2.5 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  SQL preview
                </div>
                <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all">
                  {sql}
                </pre>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="pressable px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matched || disabled || !result.ok}
              className="pressable flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Stage delete</span>
            </button>
          </div>
        </form>
      </ModalPanel>
    </Modal>
  );
};

export const DropIndexModal: React.FC<DropIndexModalProps> = (props) => (
  <OverlayPresence isOpen={Boolean(props.isOpen && props.index)}>
    <DropIndexModalBody {...props} />
  </OverlayPresence>
);
