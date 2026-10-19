import React, { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import type { DatabaseDialect, RoutineDefinition } from "../../types";
import { OverlayPresence } from "../ui/OverlayPresence";
import { Modal, ModalPanel } from "../ui/Modal";
import { canConfirmDelete } from "../../lib/schemaChange";
import { objectDdlFor } from "../../lib/ddl/registry";
import { planScript } from "../../lib/ddl/types";
import { routineChangeKey, stagedFromPlan, type StagedSchemaChange } from "../../lib/schemaQueue";

interface DropRoutineModalProps {
  isOpen: boolean;
  dialect: DatabaseDialect;
  routine: RoutineDefinition | null;
  disabled?: boolean;
  onClose: () => void;
  onStage: (change: StagedSchemaChange) => void;
}

const DropRoutineModalBody: React.FC<DropRoutineModalProps> = ({
  isOpen,
  dialect,
  routine,
  disabled,
  onClose,
  onStage,
}) => {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTyped("");
  }, [isOpen, routine?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const ddl = objectDdlFor(dialect);
  if (!isOpen || !routine || !ddl) return null;

  const result = ddl.dropRoutine(routine);
  const sql = result.ok ? planScript(result) : "";
  const matched = canConfirmDelete(typed, routine.name);
  const noun = routine.kind === "procedure" ? "procedure" : "function";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !matched || !result.ok) return;
    onStage(
      stagedFromPlan(result, {
        key: routineChangeKey(routine),
        objectKind: routine.kind,
        action: "drop",
        schema: routine.schema,
        name: `${routine.name}(${routine.identityArguments})`,
        title: `Delete ${noun} ${routine.name}`,
        effects: { closeRoutineId: routine.id },
      }),
    );
    onClose();
  };

  return (
    <Modal>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-routine-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <span id="drop-routine-title" className="font-mono text-xs font-bold text-foreground truncate">
              Delete {noun}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label={`Close delete ${noun}`}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This cannot be undone. Code that calls{" "}
              <span className="font-bold">
                {routine.schema}.{routine.name}({routine.identityArguments})
              </span>{" "}
              will fail. If views, triggers or other objects depend on it, PostgreSQL refuses and
              nothing is dropped.
            </span>
          </div>

          <div>
            <label
              htmlFor="drop-routine-confirm"
              className="block text-[10px] font-bold tracking-wide text-muted-foreground mb-1"
            >
              Type <span className="font-mono text-foreground normal-case">{routine.name}</span> to
              confirm
            </label>
            <input
              id="drop-routine-confirm"
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
              className="pressable px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matched || disabled}
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

export const DropRoutineModal: React.FC<DropRoutineModalProps> = (props) => (
  <OverlayPresence isOpen={Boolean(props.isOpen && props.routine)}>
    <DropRoutineModalBody {...props} />
  </OverlayPresence>
);
