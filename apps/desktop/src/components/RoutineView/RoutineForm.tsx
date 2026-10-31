import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { RoutineCapabilities } from "@db/database";
import {
  emptyParameterDraft,
  type ReturnDraft,
  type RoutineDraft,
  type RoutineParameterDraft,
} from "../../lib/ddl/types";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { SqlCodeViewer } from "../SqlEditor/SqlCodeViewer";

export const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed";
export const labelClass =
  "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1";
const iconButton =
  "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30";

const MODE_LABEL: Record<RoutineParameterDraft["mode"], string> = {
  in: "IN",
  out: "OUT",
  inout: "INOUT",
  variadic: "VARIADIC",
};

interface RoutineFormProps {
  draft: RoutineDraft;
  caps: RoutineCapabilities;
  schemas: string[];
  languages: string[];
  typeSuggestions: string[];
  disabled?: boolean;
  onChange: (next: RoutineDraft) => void;
}

function TypeInput({
  value,
  listId,
  disabled,
  label,
  placeholder = "integer",
  onChange,
}: {
  value: string;
  listId: string;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      list={listId}
      value={value}
      disabled={disabled}
      spellCheck={false}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} py-1.5`}
    />
  );
}

export function RoutineForm({
  draft,
  caps,
  schemas,
  languages,
  typeSuggestions,
  disabled,
  onChange,
}: RoutineFormProps) {
  const listId = useId();
  const isFunction = draft.kind === "function";
  const set = (patch: Partial<RoutineDraft>) => onChange({ ...draft, ...patch });
  const setParam = (position: number, patch: Partial<RoutineParameterDraft>) =>
    set({
      parameters: draft.parameters.map((param, i) => (i === position ? { ...param, ...patch } : param)),
    });
  const moveParam = (position: number, delta: number) => {
    const parameters = [...draft.parameters];
    const [param] = parameters.splice(position, 1);
    parameters.splice(position + delta, 0, param);
    set({ parameters });
  };
  const setReturns = (returns: ReturnDraft) => set({ returns });
  const languageOptions = Array.from(new Set([draft.language, ...languages].filter(Boolean)));
  const schemaOptions = Array.from(new Set([draft.schema, ...schemas].filter(Boolean)));
  const modeSource = isFunction && caps.functionParameterModes ? caps.functionParameterModes : caps.parameterModes;
  const modes = modeSource.filter(
    (mode): mode is RoutineParameterDraft["mode"] => mode !== "table",
  );
  const setReturnsSet = draft.returns.kind === "table" || draft.returns.setOf;

  return (
    <div className="space-y-4">
      <datalist id={listId}>
        {typeSuggestions.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 md:grid-cols-[10rem_12rem_1fr] gap-3">
        <div>
          <label className={labelClass} htmlFor="routine-kind">
            Kind
          </label>
          <Select
            id="routine-kind"
            value={draft.kind}
            disabled={disabled || caps.kinds.length < 2}
            aria-label="Routine kind"
            options={caps.kinds.map((kind) => ({
              value: kind,
              label: kind === "procedure" ? "Procedure" : "Function",
            }))}
            onChange={(kind) => set({ kind })}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="routine-schema">
            Schema
          </label>
          <Select
            id="routine-schema"
            className="font-mono"
            value={draft.schema}
            disabled={disabled}
            aria-label="Schema"
            options={schemaOptions.map((schema) => ({ value: schema, label: schema }))}
            onChange={(schema) => set({ schema })}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="routine-name">
            Name
          </label>
          <input
            id="routine-name"
            type="text"
            value={draft.name}
            disabled={disabled}
            spellCheck={false}
            placeholder={isFunction ? "function_name" : "procedure_name"}
            onChange={(event) => set({ name: event.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={labelClass}>Parameters</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => set({ parameters: [...draft.parameters, emptyParameterDraft()] })}
            className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background hover:bg-accent border border-border text-xs font-medium disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add parameter</span>
          </button>
        </div>
        {draft.parameters.length === 0 ? (
          <p className="text-[11px] text-muted-foreground font-mono">No parameters.</p>
        ) : (
          <div className="space-y-1.5">
            {draft.parameters.map((param, position) => (
              <div key={position} className="flex items-center gap-2">
                <div className="w-28 shrink-0">
                  <Select
                    size="sm"
                    value={param.mode}
                    disabled={disabled}
                    aria-label={`Parameter ${position + 1} mode`}
                    options={modes.map((mode) => ({ value: mode, label: MODE_LABEL[mode] }))}
                    onChange={(mode) => setParam(position, { mode, default: mode === "out" ? "" : param.default })}
                  />
                </div>
                <input
                  type="text"
                  value={param.name}
                  disabled={disabled}
                  spellCheck={false}
                  placeholder="name"
                  aria-label={`Parameter ${position + 1} name`}
                  onChange={(event) => setParam(position, { name: event.target.value })}
                  className={`${inputClass} py-1.5 w-40 shrink-0`}
                />
                <div className="flex-1 min-w-0">
                  <TypeInput
                    value={param.dataType}
                    listId={listId}
                    disabled={disabled}
                    label={`Parameter ${position + 1} type`}
                    onChange={(dataType) => setParam(position, { dataType })}
                  />
                </div>
                <input
                  type="text"
                  value={param.default}
                  disabled={disabled || param.mode === "out"}
                  spellCheck={false}
                  placeholder="default"
                  aria-label={`Parameter ${position + 1} default`}
                  onChange={(event) => setParam(position, { default: event.target.value })}
                  className={`${inputClass} py-1.5 w-36 shrink-0`}
                />
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    className={iconButton}
                    disabled={disabled || position === 0}
                    onClick={() => moveParam(position, -1)}
                    aria-label={`Move parameter ${position + 1} up`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    disabled={disabled || position === draft.parameters.length - 1}
                    onClick={() => moveParam(position, 1)}
                    aria-label={`Move parameter ${position + 1} down`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className={`${iconButton} hover:text-destructive`}
                    disabled={disabled}
                    onClick={() => set({ parameters: draft.parameters.filter((_, i) => i !== position) })}
                    aria-label={`Remove parameter ${position + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isFunction && (
        <div className="space-y-1.5">
          <span className={labelClass}>Returns</span>
          <div className="flex items-center gap-2">
            {caps.returnsTable && (
              <div className="w-32 shrink-0">
                <Select
                  size="sm"
                  value={draft.returns.kind}
                  disabled={disabled}
                  aria-label="Return kind"
                  options={[
                    { value: "type", label: "Type" },
                    { value: "table", label: "TABLE (…)" },
                  ]}
                  onChange={(kind) =>
                    setReturns(
                      kind === "table"
                        ? { kind: "table", columns: [{ name: "", dataType: "" }] }
                        : { kind: "type", type: "void", setOf: false },
                    )
                  }
                />
              </div>
            )}
            {draft.returns.kind === "type" && (
              <>
                <div className="flex-1 min-w-0">
                  <TypeInput
                    value={draft.returns.type}
                    listId={listId}
                    disabled={disabled}
                    label="Return type"
                    placeholder="void"
                    onChange={(type) =>
                      draft.returns.kind === "type" && setReturns({ ...draft.returns, type })
                    }
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-mono shrink-0 cursor-pointer">
                  <Checkbox
                    checked={draft.returns.setOf}
                    aria-label="Returns a set"
                    onCheckedChange={(setOf) =>
                      draft.returns.kind === "type" && setReturns({ ...draft.returns, setOf })
                    }
                  />
                  SETOF
                </label>
              </>
            )}
          </div>
          {draft.returns.kind === "table" && (
            <div className="space-y-1.5 pl-2 border-l-2 border-border">
              {draft.returns.columns.map((column, position) => (
                <div key={position} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={column.name}
                    disabled={disabled}
                    spellCheck={false}
                    placeholder="column"
                    aria-label={`Result column ${position + 1} name`}
                    onChange={(event) =>
                      draft.returns.kind === "table" &&
                      setReturns({
                        kind: "table",
                        columns: draft.returns.columns.map((c, i) =>
                          i === position ? { ...c, name: event.target.value } : c,
                        ),
                      })
                    }
                    className={`${inputClass} py-1.5 w-48 shrink-0`}
                  />
                  <div className="flex-1 min-w-0">
                    <TypeInput
                      value={column.dataType}
                      listId={listId}
                      disabled={disabled}
                      label={`Result column ${position + 1} type`}
                      onChange={(dataType) =>
                        draft.returns.kind === "table" &&
                        setReturns({
                          kind: "table",
                          columns: draft.returns.columns.map((c, i) =>
                            i === position ? { ...c, dataType } : c,
                          ),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className={`${iconButton} hover:text-destructive`}
                    disabled={disabled || (draft.returns.kind === "table" && draft.returns.columns.length === 1)}
                    onClick={() =>
                      draft.returns.kind === "table" &&
                      setReturns({
                        kind: "table",
                        columns: draft.returns.columns.filter((_, i) => i !== position),
                      })
                    }
                    aria-label={`Remove result column ${position + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  draft.returns.kind === "table" &&
                  setReturns({
                    kind: "table",
                    columns: [...draft.returns.columns, { name: "", dataType: "" }],
                  })
                }
                className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground text-xs disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add column</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelClass} htmlFor="routine-language">
            Language
          </label>
          <Select
            id="routine-language"
            className="font-mono"
            value={draft.language}
            disabled={disabled}
            aria-label="Language"
            options={languageOptions.map((language) => ({ value: language, label: language }))}
            onChange={(language) => set({ language })}
          />
        </div>
        {isFunction && caps.volatilities.length > 0 && (
          <div>
            <label className={labelClass} htmlFor="routine-volatility">
              Volatility
            </label>
            <Select
              id="routine-volatility"
              value={draft.volatility}
              disabled={disabled}
              aria-label="Volatility"
              options={caps.volatilities.map((v) => ({ value: v, label: v.toUpperCase() }))}
              onChange={(volatility) => set({ volatility })}
            />
          </div>
        )}
        {isFunction && caps.parallelModes.length > 0 && (
          <div>
            <label className={labelClass} htmlFor="routine-parallel">
              Parallel
            </label>
            <Select
              id="routine-parallel"
              value={draft.parallel || "unsafe"}
              disabled={disabled}
              aria-label="Parallel safety"
              options={caps.parallelModes.map((mode) => ({ value: mode, label: mode.toUpperCase() }))}
              onChange={(parallel) => set({ parallel })}
            />
          </div>
        )}
        {isFunction && caps.costAndRows && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="routine-cost">
                Cost
              </label>
              <input
                id="routine-cost"
                type="number"
                min={0}
                value={draft.cost}
                disabled={disabled}
                placeholder="100"
                onChange={(event) => set({ cost: event.target.value })}
                className={`${inputClass} py-1.5`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-rows">
                Rows
              </label>
              <input
                id="routine-rows"
                type="number"
                min={0}
                value={draft.rows}
                disabled={disabled || !setReturnsSet}
                placeholder="1000"
                onChange={(event) => set({ rows: event.target.value })}
                className={`${inputClass} py-1.5`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {isFunction && caps.deterministic && (
          <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
            <Checkbox
              checked={draft.volatility === "immutable"}
              aria-label="Deterministic"
              onCheckedChange={(deterministic) => set({ volatility: deterministic ? "immutable" : "volatile" })}
            />
            DETERMINISTIC
            <span className="text-[10px] text-muted-foreground font-sans">same inputs, same result</span>
          </label>
        )}
        {isFunction && caps.dataAccessModes && caps.dataAccessModes.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Data access</span>
            <Select
              value={draft.dataAccess ?? caps.dataAccessModes[0]}
              aria-label="Data access"
              options={caps.dataAccessModes.map((mode) => ({ value: mode, label: mode }))}
              onChange={(dataAccess) =>
                set({ dataAccess: dataAccess as NonNullable<RoutineDraft["dataAccess"]> })
              }
            />
          </label>
        )}
        {isFunction && caps.strict && (
          <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
            <Checkbox checked={draft.strict} aria-label="Strict" onCheckedChange={(strict) => set({ strict })} />
            STRICT
            <span className="text-[10px] text-muted-foreground font-sans">returns NULL on NULL input</span>
          </label>
        )}
        {caps.securityDefiner && (
          <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
            <Checkbox
              checked={draft.securityDefiner}
              aria-label="Security definer"
              onCheckedChange={(securityDefiner) => set({ securityDefiner })}
            />
            SECURITY DEFINER
            <span className="text-[10px] text-muted-foreground font-sans">runs with the owner's privileges</span>
          </label>
        )}
        {isFunction && caps.leakproof && (
          <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
            <Checkbox
              checked={draft.leakproof}
              aria-label="Leakproof"
              onCheckedChange={(leakproof) => set({ leakproof })}
            />
            LEAKPROOF
            <span className="text-[10px] text-muted-foreground font-sans">superuser only</span>
          </label>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="routine-comment">
          Comment
        </label>
        <input
          id="routine-comment"
          type="text"
          value={draft.comment}
          disabled={disabled}
          placeholder="What it does"
          onChange={(event) => set({ comment: event.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <span className={labelClass}>Body</span>
        <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[16rem] [&_.cm-editor]:min-h-[16rem]">
          <SqlCodeViewer
            value={draft.body}
            aria-label="Routine body"
            onChange={disabled ? undefined : (body) => set({ body })}
          />
        </div>
      </div>
    </div>
  );
}
