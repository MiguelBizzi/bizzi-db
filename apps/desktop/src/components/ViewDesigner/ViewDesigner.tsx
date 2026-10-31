import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Code, Eye, Trash2 } from "lucide-react";
import { ErrorNotice } from "../ui/ErrorNotice";
import type { DatabaseDialect, TableSchema } from "../../types";
import { dialectModule } from "@db/database";
import { objectDdlFor } from "../../lib/ddl/registry";
import { planScript, type ViewDraft } from "../../lib/ddl/types";
import { stagedFromPlan, viewChangeKey, type StagedSchemaChange } from "../../lib/schemaQueue";
import { toast } from "../../lib/toast";
import { useTabFormState } from "../../lib/tabFormState";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { SqlCodeViewer } from "../SqlEditor/SqlCodeViewer";

const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1";

interface ViewDesignerProps {
  /** Keeps an unfinished form when the user switches tabs. */
  tabId?: string;
  /** Absent to create a new view. */
  view?: TableSchema;
  defaultSchema: string;
  schemas: string[];
  dialect: DatabaseDialect;
  disabled?: boolean;
  /** Runs a new view's DDL, reloads the schema and points the tab at it. */
  onExecute: (sql: string, target: { schema: string; name: string }) => Promise<{ error?: string }>;
  /** Stages edits of an existing view in Pending Changes. */
  onStage: (change: StagedSchemaChange) => void;
  stagedChange?: StagedSchemaChange;
  onOpenPending: () => void;
  onOpenSql: (sql: string, title: string) => void;
  onDelete: (view: TableSchema) => void;
}

function CheckRow({
  checked,
  disabled,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-xs text-foreground ${
        disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"
      }`}
    >
      <span className="mt-0.5">
        <Checkbox checked={checked} onCheckedChange={onChange} aria-label={label} />
      </span>
      <span>
        <span className="font-mono">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export const ViewDesigner: React.FC<ViewDesignerProps> = ({
  tabId,
  view,
  defaultSchema,
  schemas,
  dialect,
  disabled,
  onExecute,
  onStage,
  stagedChange,
  onOpenPending,
  onOpenSql,
  onDelete,
}) => {
  const ddl = objectDdlFor(dialect);
  const caps = dialectModule(dialect)?.capabilities;
  const creating = !view;
  const initial = (): ViewDraft | null =>
    ddl ? (view ? ddl.viewDraftFrom(view) : ddl.emptyViewDraft(defaultSchema)) : null;
  const [draft, setDraft] = useTabFormState<ViewDraft | null>(tabId, "draft", initial);
  // The view as it was when the draft was taken from it.
  const signature = view
    ? JSON.stringify([view.viewSql, view.name, view.schema, view.description])
    : "";
  const [baseline, setBaseline] = useTabFormState(tabId, "baseline", signature);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The view itself changed (a staged change was applied): start over from it.
  // Switching tabs and back keeps the draft, since the baseline is unchanged.
  useEffect(() => {
    if (!view || signature === baseline) return;
    setBaseline(signature);
    setDraft(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const result = useMemo(() => {
    if (!ddl || !draft) return null;
    return view ? ddl.planViewChange(view, draft) : ddl.createView(draft);
  }, [ddl, draft, view]);
  const plan = result?.ok ? result : null;
  const sql = plan ? planScript(plan) : "";

  if (!ddl || !draft) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Views are not supported for this database yet.
      </div>
    );
  }

  const noun = draft.materialized ? "materialized view" : "view";
  const set = (patch: Partial<ViewDraft>) => {
    setDraft({ ...draft, ...patch });
    setSubmitError(null);
  };
  const schemaOptions = Array.from(new Set([draft.schema, ...schemas].filter(Boolean)));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan || plan.statements.length === 0 || submitting || disabled) return;
    const target = { schema: draft.schema.trim(), name: draft.name.trim() };
    if (view) {
      const toId = `${target.schema}.${target.name}`;
      onStage(
        stagedFromPlan(plan, {
          key: viewChangeKey(view),
          objectKind: "view",
          action: plan.mode === "recreate" ? "recreate" : plan.mode === "replace" ? "replace" : "alter",
          schema: view.schema,
          name: view.name,
          title:
            plan.mode === "recreate"
              ? `Recreate ${noun} ${view.name}`
              : toId !== view.id
                ? `Rename ${noun} ${view.name} to ${toId}`
                : `Edit ${noun} ${view.name}`,
          effects: toId !== view.id ? { retargetTable: { fromId: view.id, toId } } : undefined,
        }),
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await onExecute(sql, target);
      if (outcome.error) {
        setSubmitError(outcome.error);
        return;
      }
      toast.success(`${draft.materialized ? "Materialized view" : "View"} ${target.schema}.${target.name} created`);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : `Failed to create ${noun}`);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = disabled || submitting;
  const canSubmit = Boolean(plan && plan.statements.length > 0) && !busy;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans text-foreground"
    >
      <div className="p-4 bg-card border-b border-border flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 font-mono min-w-0">
          <Eye className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground truncate">
              {view ? `${view.schema}.${view.name}` : `New ${noun}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {view
                ? `${view.isMaterialized ? "Materialized view" : "View"} · edits are staged in Pending Changes`
                : "Write the SELECT, then create it"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view && (
            <>
              <button
                type="button"
                onClick={() => onOpenSql(`SELECT * FROM ${view.schema}.${view.name} LIMIT 100;`, `Query · ${view.name}`)}
                className="pressable flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background hover:bg-accent text-muted-foreground border border-border text-xs font-medium transition-colors"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Query</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(view)}
                className="pressable flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background hover:bg-rose-500/10 hover:text-rose-300 text-muted-foreground border border-border text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? "Creating…" : creating ? `Create ${noun}` : "Stage changes"}</span>
          </button>
        </div>
      </div>

      {stagedChange && (
        <div className="px-4 py-2 text-[11px] font-mono border-b bg-amber-500/10 text-amber-300 border-amber-500/20 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Pending: {stagedChange.title}. The form shows the current definition.</span>
          </span>
          <button
            type="button"
            onClick={onOpenPending}
            className="shrink-0 px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/20 transition-colors"
          >
            Review
          </button>
        </div>
      )}

      {submitError && (
        <ErrorNotice message={submitError} className="field-message px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20" />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[12rem_1fr] gap-3 max-w-3xl">
          <div>
            <label className={labelClass} htmlFor="view-schema">
              Schema
            </label>
            <Select
              id="view-schema"
              className="font-mono"
              value={draft.schema}
              disabled={busy}
              aria-label="Schema"
              options={schemaOptions.map((schema) => ({ value: schema, label: schema }))}
              onChange={(schema) => set({ schema })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="view-name">
              Name
            </label>
            <input
              id="view-name"
              type="text"
              value={draft.name}
              disabled={busy}
              spellCheck={false}
              autoFocus={creating}
              placeholder="view_name"
              onChange={(event) => set({ name: event.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {creating ? (
            <>
              {caps?.materializedViews !== false && (
                <>
                  <CheckRow
                    checked={draft.materialized}
                    disabled={busy}
                    label="MATERIALIZED"
                    hint="Store the result; refresh it with REFRESH MATERIALIZED VIEW."
                    onChange={(materialized) => set({ materialized })}
                  />
                  {draft.materialized && (
                    <CheckRow
                      checked={draft.withData}
                      disabled={busy}
                      label="WITH DATA"
                      hint="Populate now. Off creates it empty (WITH NO DATA)."
                      onChange={(withData) => set({ withData })}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            !draft.materialized && (
              <CheckRow
                checked={draft.recreate}
                disabled={busy}
                label="Drop and recreate"
                hint="Needed to remove, rename or retype columns. Fails if other objects depend on the view."
                onChange={(recreate) => set({ recreate })}
              />
            )
          )}
        </div>

        {caps?.materializedViews !== false && (
        <div className="max-w-3xl">
          <label className={labelClass} htmlFor="view-comment">
            Comment
          </label>
          <input
            id="view-comment"
            type="text"
            value={draft.comment}
            disabled={busy}
            placeholder="What it shows"
            onChange={(event) => set({ comment: event.target.value })}
            className={inputClass}
          />
        </div>
        )}

        {caps?.materializedViews === false && creating && (
          <CheckRow
            checked={Boolean(draft.checkOption)}
            disabled={busy}
            label="WITH CHECK OPTION"
            hint="Reject inserts and updates that the view itself would not return."
            onChange={(checkOption) => set({ checkOption })}
          />
        )}

        <div>
          <span className={labelClass}>Definition (SELECT)</span>
          <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[16rem] [&_.cm-editor]:min-h-[16rem]">
            <SqlCodeViewer
              value={draft.definition}
              aria-label="View definition"
              onChange={busy ? undefined : (definition) => set({ definition })}
            />
          </div>
        </div>

        {plan && plan.warnings.length > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{plan.warnings.join(" ")}</span>
          </div>
        )}

        <div className="rounded-xl bg-background border border-primary/20 p-2.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">SQL preview</div>
          {result && !result.ok ? (
            <p className="field-message text-[11px] font-mono text-rose-300">{result.reason}</p>
          ) : sql ? (
            <SqlCodeViewer value={sql} lineNumbers={false} aria-label="SQL preview" />
          ) : (
            <p className="text-[11px] font-mono text-muted-foreground">No changes to apply.</p>
          )}
        </div>
      </div>
    </form>
  );
};
