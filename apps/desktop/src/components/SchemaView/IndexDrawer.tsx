import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ListTree,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ErrorNotice } from "../ui/ErrorNotice";
import {
  dialectMeta,
  indexMethod,
  methodSupportsInclude,
  storageParamsFor,
  versionAtLeast,
} from "@db/database";
import type { DatabaseDialect, IndexDefinition, TableSchema } from "../../types";
import { OverlayPresence } from "../ui/OverlayPresence";
import { Drawer, DrawerPanel } from "../ui/Drawer";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { objectDdlFor } from "../../lib/ddl/registry";
import { indexChangeKey, stagedFromPlan, type StagedSchemaChange } from "../../lib/schemaQueue";
import {
  emptyKeyDraft,
  planScript,
  type IndexContext,
  type IndexDraft,
  type IndexKeyDraft,
} from "../../lib/ddl/types";

const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1";
const sectionClass = "space-y-1.5";
const iconButton =
  "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30";

interface IndexDrawerProps {
  isOpen: boolean;
  table: TableSchema;
  tables: TableSchema[];
  dialect: DatabaseDialect;
  serverVersionNum?: number;
  /** The index being edited; absent to create one. */
  index: IndexDefinition | null;
  disabled?: boolean;
  onClose: () => void;
  /** Runs a new index's DDL right away. */
  onExecute: (sql: string) => Promise<{ error?: string }>;
  /** Stages a change to an existing index in Pending Changes. */
  onStage: (change: StagedSchemaChange) => void;
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
  hint?: string;
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
        {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

const IndexDrawerBody: React.FC<IndexDrawerProps> = ({
  isOpen,
  table,
  tables,
  dialect,
  serverVersionNum,
  index,
  disabled,
  onClose,
  onExecute,
  onStage,
}) => {
  const ddl = objectDdlFor(dialect);
  const caps = dialectMeta(dialect)?.objects.indexes;
  const ctx: IndexContext = useMemo(
    () => ({ table, tables, serverVersionNum }),
    [table, tables, serverVersionNum],
  );
  const initial = (): IndexDraft => {
    if (!ddl) throw new Error("No index DDL for this database");
    if (index) return ddl.indexDraftFrom(index);
    const firstColumn = table.columns.find((column) => !column.isPrimary) ?? table.columns[0];
    return { ...ddl.emptyIndexDraft(table), keys: [emptyKeyDraft(firstColumn?.name ?? "")] };
  };
  const [draft, setDraft] = useState<IndexDraft>(initial);
  const [nameTouched, setNameTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const next = initial();
    setDraft(next);
    setNameTouched(Boolean(index));
    setShowAdvanced(next.keys.some((key) => key.opclass || key.collation));
    setSubmitError(null);
    setSubmitting(false);
    requestAnimationFrame(() => panelRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, table.id, index?.name]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // A new index follows PostgreSQL's naming until the user names it.
  const effective = useMemo<IndexDraft>(() => {
    if (!ddl || nameTouched) return draft;
    return { ...draft, name: ddl.suggestIndexName(draft, ctx) };
  }, [ddl, draft, nameTouched, ctx]);

  const result = useMemo(() => {
    if (!ddl) return null;
    return index ? ddl.planIndexChange(index, effective, ctx) : ddl.createIndex(effective, ctx);
  }, [ddl, index, effective, ctx]);

  if (!isOpen || !ddl || !caps) return null;

  const method = indexMethod(caps, draft.method) ?? caps.methods[0];
  const includeSupported = methodSupportsInclude(method, serverVersionNum);
  const nndSupported = versionAtLeast(serverVersionNum, caps.nullsNotDistinctMinVersion);
  const paramSpecs = storageParamsFor(method, serverVersionNum);
  const plan = result?.ok ? result : null;
  const sql = plan ? planScript(plan) : "";
  const canSubmit = Boolean(plan && plan.statements.length > 0) && !submitting && !disabled;
  const busy = disabled || submitting;
  const columnOptions = table.columns.map((column) => ({
    value: column.name,
    label: `${column.name} · ${column.type}`,
  }));

  const update = (patch: Partial<IndexDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSubmitError(null);
  };
  const updateKey = (position: number, patch: Partial<IndexKeyDraft>) =>
    update({
      keys: draft.keys.map((key, i) => (i === position ? { ...key, ...patch } : key)),
    });
  const moveKey = (position: number, delta: number) => {
    const keys = [...draft.keys];
    const [key] = keys.splice(position, 1);
    keys.splice(position + delta, 0, key);
    update({ keys });
  };
  const setMethod = (id: string) => {
    const next = indexMethod(caps, id);
    if (!next) return;
    update({
      method: id,
      unique: next.unique ? draft.unique : false,
      nullsNotDistinct: next.unique ? draft.nullsNotDistinct : false,
      keys: next.ordering
        ? draft.keys
        : draft.keys.map((key) => ({ ...key, descending: false, nulls: "default" })),
      include: methodSupportsInclude(next, serverVersionNum) ? draft.include : [],
      storageParams: draft.storageParams.filter((param) =>
        storageParamsFor(next, serverVersionNum).some((spec) => spec.name === param.name),
      ),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !sql) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (index && plan) {
        onStage(
          stagedFromPlan(plan, {
            key: indexChangeKey(table, index.name),
            objectKind: "index",
            action: plan.mode === "recreate" ? "recreate" : "alter",
            schema: table.schema,
            name: index.name,
            parent: `${table.schema}.${table.name}`,
            title:
              plan.mode === "recreate"
                ? `Rebuild index ${index.name}`
                : effective.name.trim() !== index.name
                  ? `Rename index ${index.name} to ${effective.name.trim()}`
                  : `Alter index ${index.name}`,
          }),
        );
        onClose();
        return;
      }
      const outcome = await onExecute(sql);
      if (outcome.error) {
        setSubmitError(outcome.error);
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Failed to apply index change");
    } finally {
      setSubmitting(false);
    }
  };

  const title = index ? "Edit index" : "New index";
  const unusedInclude = table.columns.filter((column) => !draft.include.includes(column.name));
  const unusedParams = paramSpecs.filter(
    (spec) => !draft.storageParams.some((param) => param.name === spec.name),
  );

  return (
    <Drawer onScrimClick={onClose}>
      <DrawerPanel
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="index-drawer-title"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-popover border-l border-border shadow-2xl flex flex-col font-sans text-popover-foreground outline-none"
      >
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListTree className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div id="index-drawer-title" className="font-mono text-xs font-bold text-foreground">
                {title}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {table.schema}.{table.name}
                {index ? ` · ${index.name}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close index editor"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {submitError && (
          <ErrorNotice message={submitError} className="field-message px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20" />
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className={sectionClass}>
                <label className={labelClass} htmlFor="index-name">
                  Index name
                </label>
                <input
                  id="index-name"
                  type="text"
                  value={effective.name}
                  disabled={busy}
                  spellCheck={false}
                  onChange={(event) => {
                    setNameTouched(true);
                    update({ name: event.target.value });
                  }}
                  className={inputClass}
                />
              </div>
              <div className={sectionClass}>
                <label className={labelClass} htmlFor="index-method">
                  Method
                </label>
                <Select
                  id="index-method"
                  className="font-mono"
                  value={method.id}
                  disabled={busy}
                  aria-label="Index method"
                  options={caps.methods.map((entry) => ({ value: entry.id, label: entry.label }))}
                  onChange={setMethod}
                />
                <p className="text-[10px] text-muted-foreground">{method.description}</p>
              </div>
            </div>

            <div className={sectionClass}>
              <div className="flex items-center justify-between">
                <span className={labelClass}>Keys</span>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={showAdvanced}
                    onCheckedChange={setShowAdvanced}
                    aria-label="Show operator class and collation"
                  />
                  Operator class &amp; collation
                </label>
              </div>
              <div className="space-y-2">
                {draft.keys.map((key, position) => (
                  <div
                    key={position}
                    className="rounded-xl border border-border bg-card p-2 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-28 shrink-0">
                        <Select
                          size="sm"
                          value={key.kind}
                          disabled={busy || !caps.expressions}
                          aria-label={`Key ${position + 1} kind`}
                          options={[
                            { value: "column", label: "Column" },
                            { value: "expression", label: "Expression" },
                          ]}
                          onChange={(kind) =>
                            updateKey(position, {
                              kind,
                              value: kind === "column" ? table.columns[0]?.name ?? "" : "",
                            })
                          }
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {key.kind === "column" ? (
                          <Select
                            size="sm"
                            className="font-mono"
                            searchable
                            value={key.value}
                            disabled={busy}
                            placeholder="Choose a column"
                            aria-label={`Key ${position + 1} column`}
                            options={columnOptions}
                            onChange={(value) => updateKey(position, { value })}
                          />
                        ) : (
                          <input
                            type="text"
                            value={key.value}
                            disabled={busy}
                            spellCheck={false}
                            placeholder="lower(email)"
                            aria-label={`Key ${position + 1} expression`}
                            onChange={(event) => updateKey(position, { value: event.target.value })}
                            className={`${inputClass} py-1.5`}
                          />
                        )}
                      </div>
                      {method.ordering && (
                        <>
                          <div className="w-20 shrink-0">
                            <Select
                              size="sm"
                              value={key.descending ? "desc" : "asc"}
                              disabled={busy}
                              aria-label={`Key ${position + 1} order`}
                              options={[
                                { value: "asc", label: "ASC" },
                                { value: "desc", label: "DESC" },
                              ]}
                              onChange={(order) => updateKey(position, { descending: order === "desc" })}
                            />
                          </div>
                          <div className="w-32 shrink-0">
                            <Select
                              size="sm"
                              value={key.nulls}
                              disabled={busy}
                              aria-label={`Key ${position + 1} null order`}
                              options={[
                                { value: "default", label: "Nulls default" },
                                { value: "first", label: "NULLS FIRST" },
                                { value: "last", label: "NULLS LAST" },
                              ]}
                              onChange={(nulls) => updateKey(position, { nulls })}
                            />
                          </div>
                        </>
                      )}
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          className={iconButton}
                          disabled={busy || position === 0}
                          onClick={() => moveKey(position, -1)}
                          aria-label={`Move key ${position + 1} up`}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className={iconButton}
                          disabled={busy || position === draft.keys.length - 1}
                          onClick={() => moveKey(position, 1)}
                          aria-label={`Move key ${position + 1} down`}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className={`${iconButton} hover:text-destructive`}
                          disabled={busy || draft.keys.length === 1}
                          onClick={() => update({ keys: draft.keys.filter((_, i) => i !== position) })}
                          aria-label={`Remove key ${position + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {showAdvanced && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={key.opclass}
                          disabled={busy || !caps.opclasses}
                          spellCheck={false}
                          placeholder="Operator class (default)"
                          aria-label={`Key ${position + 1} operator class`}
                          onChange={(event) => updateKey(position, { opclass: event.target.value })}
                          className={`${inputClass} py-1.5`}
                        />
                        <input
                          type="text"
                          value={key.collation}
                          disabled={busy || !caps.collations}
                          spellCheck={false}
                          placeholder='Collation (default), e.g. "C"'
                          aria-label={`Key ${position + 1} collation`}
                          onChange={(event) => updateKey(position, { collation: event.target.value })}
                          className={`${inputClass} py-1.5`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || (!method.multiColumn && draft.keys.length >= 1)}
                onClick={() => update({ keys: [...draft.keys, emptyKeyDraft()] })}
                className="pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 text-xs transition-colors disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add key</span>
              </button>
            </div>

            <div className="space-y-2">
              <CheckRow
                checked={draft.unique}
                disabled={busy || !method.unique}
                label="UNIQUE"
                hint={
                  method.unique
                    ? "Reject rows that repeat these key values."
                    : `${method.label} indexes cannot enforce uniqueness.`
                }
                onChange={(unique) =>
                  update({ unique, nullsNotDistinct: unique ? draft.nullsNotDistinct : false })
                }
              />
              {draft.unique && caps.nullsNotDistinctMinVersion !== null && (
                <CheckRow
                  checked={draft.nullsNotDistinct}
                  disabled={busy || !nndSupported}
                  label="NULLS NOT DISTINCT"
                  hint={
                    nndSupported
                      ? "Treat NULLs as equal, so only one row may have NULL keys."
                      : "Needs PostgreSQL 15 or later."
                  }
                  onChange={(nullsNotDistinct) => update({ nullsNotDistinct })}
                />
              )}
            </div>

            {includeSupported && (
              <div className={sectionClass}>
                <span className={labelClass}>Include columns</span>
                <p className="text-[10px] text-muted-foreground">
                  Stored in the index but not searched on, so queries can read them without visiting
                  the table (index-only scans).
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.include.map((column) => (
                    <span
                      key={column}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[11px] font-mono"
                    >
                      {column}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update({ include: draft.include.filter((c) => c !== column) })}
                        aria-label={`Remove included column ${column}`}
                        className="hover:text-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {unusedInclude.length > 0 && (
                    <div className="w-48">
                      <Select
                        size="sm"
                        className="font-mono"
                        searchable
                        value=""
                        disabled={busy}
                        placeholder="Add column…"
                        aria-label="Add included column"
                        options={unusedInclude.map((column) => ({
                          value: column.name,
                          label: column.name,
                        }))}
                        onChange={(column) => update({ include: [...draft.include, column] })}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {caps.partial && (
              <div className={sectionClass}>
                <label className={labelClass} htmlFor="index-predicate">
                  Where (partial index)
                </label>
                <textarea
                  id="index-predicate"
                  rows={2}
                  value={draft.predicate}
                  disabled={busy}
                  spellCheck={false}
                  placeholder="Leave empty to index every row, e.g. deleted_at IS NULL"
                  onChange={(event) => update({ predicate: event.target.value })}
                  className={`${inputClass} resize-y`}
                />
              </div>
            )}

            {paramSpecs.length > 0 && (
              <div className={sectionClass}>
                <span className={labelClass}>Storage parameters</span>
                {draft.storageParams.map((param, position) => {
                  const spec = paramSpecs.find((entry) => entry.name === param.name);
                  return (
                    <div key={param.name} className="flex items-center gap-2">
                      <span className="w-44 shrink-0 font-mono text-xs text-foreground truncate">
                        {param.name}
                      </span>
                      {spec?.kind === "integer" ? (
                        <input
                          type="number"
                          min={spec.min}
                          max={spec.max}
                          value={param.value}
                          disabled={busy}
                          aria-label={param.name}
                          onChange={(event) =>
                            update({
                              storageParams: draft.storageParams.map((p, i) =>
                                i === position ? { ...p, value: event.target.value } : p,
                              ),
                            })
                          }
                          className={`${inputClass} py-1.5`}
                        />
                      ) : (
                        <div className="flex-1">
                          <Select
                            size="sm"
                            value={param.value.toLowerCase()}
                            disabled={busy}
                            aria-label={param.name}
                            options={(spec?.kind === "enum" ? spec.values ?? [] : ["on", "off"]).map(
                              (value) => ({ value, label: value }),
                            )}
                            onChange={(value) =>
                              update({
                                storageParams: draft.storageParams.map((p, i) =>
                                  i === position ? { ...p, value } : p,
                                ),
                              })
                            }
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        className={`${iconButton} hover:text-destructive`}
                        disabled={busy}
                        onClick={() =>
                          update({ storageParams: draft.storageParams.filter((_, i) => i !== position) })
                        }
                        aria-label={`Remove ${param.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {unusedParams.length > 0 && (
                  <div className="w-64">
                    <Select
                      size="sm"
                      className="font-mono"
                      value=""
                      disabled={busy}
                      placeholder="Add parameter…"
                      aria-label="Add storage parameter"
                      options={unusedParams.map((spec) => ({
                        value: spec.name,
                        label: `${spec.name} — ${spec.hint}`,
                      }))}
                      onChange={(name) => {
                        const spec = paramSpecs.find((entry) => entry.name === name);
                        const value =
                          spec?.kind === "integer"
                            ? String(spec.name === "fillfactor" ? 90 : spec.min ?? 1)
                            : spec?.kind === "enum"
                              ? spec.values?.[0] ?? ""
                              : "on";
                        update({ storageParams: [...draft.storageParams, { name, value }] });
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {caps.tablespaces && (
              <div className={sectionClass}>
                <label className={labelClass} htmlFor="index-tablespace">
                  Tablespace
                </label>
                <input
                  id="index-tablespace"
                  type="text"
                  value={draft.tablespace}
                  disabled={busy}
                  spellCheck={false}
                  placeholder="Database default"
                  onChange={(event) => update({ tablespace: event.target.value })}
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-2">
              <span className={labelClass}>Build</span>
              {caps.concurrent && (
                <CheckRow
                  checked={draft.concurrently}
                  disabled={busy}
                  label="CONCURRENTLY"
                  hint="Build without blocking writes. Slower, and runs outside a transaction."
                  onChange={(concurrently) => update({ concurrently })}
                />
              )}
              {!index && caps.ifNotExists && (
                <CheckRow
                  checked={draft.ifNotExists}
                  disabled={busy}
                  label="IF NOT EXISTS"
                  hint="Do nothing if an index with this name already exists."
                  onChange={(ifNotExists) => update({ ifNotExists })}
                />
              )}
            </div>
          </div>

          <footer className="px-4 py-3 border-t border-border bg-background/60 space-y-2.5 shrink-0">
            {plan?.mode === "recreate" && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold">The index will be rebuilt.</span>{" "}
                  {plan.warnings.join(" ")}
                </span>
              </div>
            )}
            {plan && plan.mode !== "recreate" && plan.warnings.length > 0 && (
              <ul className="text-[10px] text-muted-foreground font-mono space-y-0.5">
                {plan.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            )}
            <div className="rounded-xl bg-background border border-primary/20 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                SQL preview
              </div>
              {result && !result.ok ? (
                <p className="field-message text-[11px] font-mono text-rose-300">{result.reason}</p>
              ) : (
                <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                  {sql || "No changes to apply."}
                </pre>
              )}
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
                disabled={!canSubmit}
                className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold shadow-md transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {submitting ? "Applying…" : index ? "Stage changes" : "Create index"}
                </span>
              </button>
            </div>
          </footer>
        </form>
      </DrawerPanel>
    </Drawer>
  );
};

export const IndexDrawer: React.FC<IndexDrawerProps> = (props) => (
  <OverlayPresence isOpen={props.isOpen}>
    <IndexDrawerBody {...props} />
  </OverlayPresence>
);
