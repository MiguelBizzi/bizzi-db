import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Code,
  Copy,
  Pencil,
  SquareFunction,
  Trash2,
  Workflow,
} from "lucide-react";
import { columnTypesFor, dialectMeta } from "@db/database";
import type { DatabaseDialect, RoutineDefinition, RoutineSource } from "../../types";
import { objectDdlFor } from "../../lib/ddl/registry";
import { planScript, type RoutineDraft } from "../../lib/ddl/types";
import type { RoutineTarget } from "../../lib/routineTabs";
import { useMenuModalGate } from "../../lib/commands/useMenuModalGate";
import { useTabFormState } from "../../lib/tabFormState";
import { toast } from "../../lib/toast";
import { routineChangeKey, stagedFromPlan, type StagedSchemaChange } from "../../lib/schemaQueue";
import { SqlCodeViewer } from "../SqlEditor/SqlCodeViewer";
import { RoutineForm } from "./RoutineForm";
import { DropRoutineModal } from "./DropRoutineModal";

interface RoutineDesignerProps {
  /** Keeps an unfinished form when the user switches tabs. */
  tabId?: string;
  /** Absent to create a new routine. */
  routine?: RoutineDefinition;
  defaultSchema: string;
  schemas: string[];
  languages: string[];
  dialect: DatabaseDialect;
  disabled?: boolean;
  /** Set by "Edit" in a menu: switch to the editor once. */
  editRequested?: boolean;
  onEditRequestHandled?: () => void;
  loadSource: (routine: RoutineDefinition) => Promise<RoutineSource>;
  /** Runs a new routine's DDL, reloads the schema and points the tab at `target`. */
  onExecute: (sql: string, target?: RoutineTarget) => Promise<{ error?: string }>;
  /** Stages edits and deletes of an existing routine in Pending Changes. */
  onStage: (change: StagedSchemaChange) => void;
  stagedChange?: StagedSchemaChange;
  onOpenPending: () => void;
  onOpenSql: (sql: string, title: string) => void;
}

type SourceState =
  | { status: "loading" }
  | { status: "ready"; source: RoutineSource }
  | { status: "error"; error: string };

const BADGE = "px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap";

function signature(routine: RoutineDefinition): string {
  return `${routine.schema}.${routine.name}(${routine.identityArguments})`;
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-mono text-foreground truncate" title={typeof children === "string" ? children : undefined}>
        {children}
      </div>
    </div>
  );
}

export const RoutineDesigner: React.FC<RoutineDesignerProps> = ({
  tabId,
  routine,
  defaultSchema,
  schemas,
  languages,
  dialect,
  disabled,
  editRequested,
  onEditRequestHandled,
  loadSource,
  onExecute,
  onStage,
  stagedChange,
  onOpenPending,
  onOpenSql,
}) => {
  const ddl = objectDdlFor(dialect);
  const caps = dialectMeta(dialect)?.objects.routines;
  const creating = !routine;
  const [viewTab, setViewTab] = useTabFormState<"overview" | "definition">(tabId, "viewTab", "overview");
  const [source, setSource] = useState<SourceState>({ status: "loading" });
  const [draft, setDraft] = useTabFormState<RoutineDraft | null>(tabId, "draft", () =>
    creating && ddl ? ddl.emptyRoutineDraft(defaultSchema, "function") : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);

  useMenuModalGate(`routine:${routine?.id ?? "new"}`, dropOpen);

  // Every schema reload hands over a fresh routine object, so the source is
  // re-read after CREATE OR REPLACE even though the oid stays the same.
  useEffect(() => {
    if (!routine) return;
    let cancelled = false;
    setSource({ status: "loading" });
    loadSource(routine)
      .then((loaded) => !cancelled && setSource({ status: "ready", source: loaded }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setSource({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [routine, loadSource]);

  const editable = Boolean(routine && !routine.hasSqlBody && source.status === "ready" && ddl);
  const startEditing = () => {
    if (!routine || !ddl || source.status !== "ready") return;
    setDraft(ddl.routineDraftFrom(routine, source.source.body));
    setSubmitError(null);
  };

  useEffect(() => {
    if (!editRequested || !routine) return;
    if (source.status === "loading") return;
    if (editable) startEditing();
    onEditRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequested, routine, source.status, editable]);

  const result = useMemo(() => {
    if (!draft || !ddl) return null;
    if (!routine) return ddl.createRoutine(draft);
    if (source.status !== "ready") return null;
    return ddl.planRoutineChange(routine, source.source.body, draft);
  }, [draft, ddl, routine, source]);
  const plan = result?.ok ? result : null;
  const sql = plan ? planScript(plan) : "";

  const typeSuggestions = useMemo(() => {
    const names = (columnTypesFor(dialect) ?? [])
      .map((type) => type.sqlName)
      .filter((name) => !/serial/.test(name));
    return Array.from(new Set([...(caps?.returnTypePresets ?? []), ...names]));
  }, [dialect, caps]);

  if (!ddl || !caps) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Functions are not supported for this database yet.
      </div>
    );
  }

  const handleApply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !plan || plan.statements.length === 0 || submitting || disabled) return;
    setSubmitting(true);
    setSubmitError(null);
    const keepsArguments = routine && plan.mode !== "recreate";
    const target: RoutineTarget = {
      schema: draft.schema.trim(),
      name: draft.name.trim(),
      preferredId: keepsArguments
        ? `${draft.schema.trim()}.${draft.name.trim()}(${routine.identityArguments})`
        : undefined,
    };
    try {
      if (routine) {
        const renamed = target.name !== routine.name || target.schema !== routine.schema;
        onStage(
          stagedFromPlan(plan, {
            key: routineChangeKey(routine),
            objectKind: routine.kind,
            action: plan.mode === "recreate" ? "recreate" : plan.mode === "replace" ? "replace" : "alter",
            schema: routine.schema,
            name: `${routine.name}(${routine.identityArguments})`,
            title:
              plan.mode === "recreate"
                ? `Recreate ${routine.kind} ${routine.name}`
                : renamed
                  ? `Rename ${routine.kind} ${routine.name} to ${target.schema}.${target.name}`
                  : `Edit ${routine.kind} ${routine.name}`,
            effects: { retargetRoutine: { fromId: routine.id, ...target } },
          }),
        );
        setDraft(null);
        return;
      }
      const outcome = await onExecute(sql, target);
      if (outcome.error) {
        setSubmitError(outcome.error);
        return;
      }
      toast.success(
        `${draft.kind === "procedure" ? "Procedure" : "Function"} ${target.schema}.${target.name} created`,
      );
      setDraft(null);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Failed to apply changes");
    } finally {
      setSubmitting(false);
    }
  };

  const copyDefinition = () => {
    if (source.status !== "ready") return;
    void navigator.clipboard
      .writeText(source.source.definition)
      .then(() => toast.success("Definition copied"))
      .catch(() => toast.error("Could not copy to clipboard"));
  };

  const Icon = (draft?.kind ?? routine?.kind) === "procedure" ? Workflow : SquareFunction;
  const noun = (draft?.kind ?? routine?.kind) === "procedure" ? "procedure" : "function";

  const header = (
    <div className="p-4 bg-card border-b border-border flex items-center justify-between shrink-0 gap-3">
      <div className="flex items-center gap-3 font-mono min-w-0">
        <Icon className="w-5 h-5 text-sky-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground truncate">
            {routine ? signature(routine) : `New ${noun}`}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            {routine ? (
              <>
                <span className={`${BADGE} bg-sky-500/10 text-sky-400 border-sky-500/30`}>
                  {routine.kind.toUpperCase()}
                </span>
                <span className={`${BADGE} bg-muted text-muted-foreground border-border`}>
                  {routine.language}
                </span>
                {routine.kind === "function" && (
                  <span className={`${BADGE} bg-muted text-muted-foreground border-border`}>
                    {routine.volatility.toUpperCase()}
                  </span>
                )}
                {routine.securityDefiner && (
                  <span className={`${BADGE} bg-amber-500/10 text-amber-400 border-amber-500/30`}>
                    SECURITY DEFINER
                  </span>
                )}
              </>
            ) : (
              <span>Define the signature and body, then create it</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {draft ? (
          <>
            {routine && (
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setSubmitError(null);
                }}
                className="px-3 py-2 rounded-lg bg-background hover:bg-accent text-foreground border border-border text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              form="routine-form"
              disabled={!plan || plan.statements.length === 0 || submitting || disabled}
              className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {submitting ? "Applying…" : creating ? `Create ${noun}` : "Stage changes"}
              </span>
            </button>
          </>
        ) : (
          routine && (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setDropOpen(true)}
                className="pressable flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background hover:bg-rose-500/10 hover:text-rose-300 text-muted-foreground border border-border text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                disabled={disabled || !editable}
                title={
                  routine.hasSqlBody
                    ? "SQL-standard bodies (BEGIN ATOMIC) can't be edited here. Open the definition in the SQL editor."
                    : undefined
                }
                onClick={startEditing}
                className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans text-foreground">
      {header}

      {stagedChange && (
        <div className="px-4 py-2 text-[11px] font-mono border-b bg-amber-500/10 text-amber-300 border-amber-500/20 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Pending: {stagedChange.title}. The definition below is still the current one.</span>
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
        <div className="field-message px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="break-all">{submitError}</span>
        </div>
      )}

      {draft ? (
        <form id="routine-form" onSubmit={handleApply} className="flex-1 overflow-y-auto p-4 space-y-4">
          <RoutineForm
            draft={draft}
            caps={caps}
            schemas={schemas}
            languages={languages}
            typeSuggestions={typeSuggestions}
            disabled={disabled || submitting}
            onChange={(next) => {
              setDraft(next);
              setSubmitError(null);
            }}
          />
          {plan?.mode === "recreate" && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">The {noun} will be dropped and recreated.</span>{" "}
                {plan.warnings.join(" ")}
              </span>
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
        </form>
      ) : routine ? (
        <>
          <div className="flex w-full border-b border-border bg-background font-mono text-xs">
            {(["overview", "definition"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewTab(id)}
                className={`flex-1 py-2.5 px-4 font-semibold border-b-2 transition-colors ${
                  viewTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {id === "overview" ? `Overview (${routine.parameters.length} params)` : "Definition"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {viewTab === "overview" ? (
              <div className="space-y-4">
                {routine.comment && (
                  <p className="text-sm text-foreground/90">{routine.comment}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Property label="Returns">
                    {routine.kind === "procedure" ? "— (procedure)" : routine.returnType ?? "—"}
                  </Property>
                  <Property label="Language">{routine.language}</Property>
                  {routine.kind === "function" && (
                    <Property label="Volatility">{routine.volatility.toUpperCase()}</Property>
                  )}
                  {routine.kind === "function" && (
                    <Property label="Null input">
                      {routine.isStrict ? "STRICT (returns NULL)" : "CALLED ON NULL INPUT"}
                    </Property>
                  )}
                  <Property label="Security">
                    {routine.securityDefiner ? "DEFINER" : "INVOKER"}
                  </Property>
                  {routine.kind === "function" && routine.parallel && (
                    <Property label="Parallel">{routine.parallel.toUpperCase()}</Property>
                  )}
                  {routine.kind === "function" && routine.cost !== undefined && (
                    <Property label="Cost">{String(routine.cost)}</Property>
                  )}
                  {routine.rows !== undefined && <Property label="Rows">{String(routine.rows)}</Property>}
                  {routine.owner && <Property label="Owner">{routine.owner}</Property>}
                </div>

                <div className="font-mono text-xs border border-border rounded-xl overflow-hidden bg-card">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-background border-b border-border">
                      <tr>
                        <th className="p-3 w-10">#</th>
                        <th className="p-3">Mode</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {routine.parameters.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-muted-foreground">
                            No parameters.
                          </td>
                        </tr>
                      ) : (
                        routine.parameters.map((param, position) => (
                          <tr key={position} className="hover:bg-accent/60 transition-colors">
                            <td className="p-3 text-muted-foreground">{position + 1}</td>
                            <td className="p-3 text-muted-foreground">
                              {param.mode === "table" ? "TABLE" : param.mode.toUpperCase()}
                            </td>
                            <td className="p-3 font-bold text-foreground">{param.name || "—"}</td>
                            <td className="p-3 text-primary">{param.dataType}</td>
                            <td className="p-3 text-muted-foreground">{param.default ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={source.status !== "ready"}
                    onClick={copyDefinition}
                    className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background hover:bg-accent border border-border text-xs font-medium disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    disabled={source.status !== "ready"}
                    onClick={() =>
                      source.status === "ready" &&
                      onOpenSql(source.source.definition, `Query · ${routine.name}`)
                    }
                    className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background hover:bg-accent border border-border text-xs font-medium disabled:opacity-50"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Open in SQL editor</span>
                  </button>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {source.status === "loading" && (
                    <div className="p-4 text-xs text-muted-foreground font-mono">Loading definition…</div>
                  )}
                  {source.status === "error" && (
                    <div className="p-4 text-xs text-rose-300 font-mono">{source.error}</div>
                  )}
                  {source.status === "ready" && (
                    <SqlCodeViewer
                      value={source.source.definition}
                      aria-label={`${routine.name} definition`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      <DropRoutineModal
        isOpen={dropOpen}
        dialect={dialect}
        routine={routine ?? null}
        disabled={disabled}
        onClose={() => setDropOpen(false)}
        onStage={onStage}
      />
    </div>
  );
};
