import React, { useMemo, useState } from "react";
import { columnTypesFor } from "@db/database";
import { AlertCircle, Check, Plus, Table2, Trash2 } from "lucide-react";
import type { DatabaseDialect, TableSchema } from "../../types";
import {
  buildCreateTableSql,
  emptyNewTableColumn,
  validateNewTable,
  type NewTableColumn,
} from "../../lib/schemaChange";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { ColumnDraftFields } from "./ColumnDraftFields";

interface CreateTableDesignerProps {
  tables: TableSchema[];
  dialect?: DatabaseDialect;
  disabled?: boolean;
  onExecute: (sql: string) => Promise<{ error?: string }>;
  onCreated?: (table: { schema: string; name: string }) => void;
}

const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1";

function initialColumns(): NewTableColumn[] {
  return [
    {
      ...emptyNewTableColumn(),
      name: "id",
      typeId: "bigserial",
      nullable: false,
      primaryKey: true,
    },
  ];
}

export const CreateTableDesigner: React.FC<CreateTableDesignerProps> = ({
  tables,
  dialect = "PostgreSQL",
  disabled,
  onExecute,
  onCreated,
}) => {
  const types = useMemo(() => columnTypesFor(dialect) ?? [], [dialect]);
  const schemas = useMemo(() => {
    const names = Array.from(new Set(tables.map((t) => t.schema)));
    if (!names.includes("public")) names.unshift("public");
    return names;
  }, [tables]);

  const [schema, setSchema] = useState(schemas[0] ?? "public");
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<NewTableColumn[]>(initialColumns);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ref = { schema, name };
  const validation = useMemo(
    () => validateNewTable(ref, columns, types, tables),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, name, columns, types, tables],
  );
  const valid =
    !validation.table &&
    !validation.form &&
    validation.columns.every((errors) => Object.keys(errors).length === 0);
  const sql = useMemo(
    () =>
      name.trim() && columns.length > 0 && columns.every((c) => c.name.trim())
        ? buildCreateTableSql(ref, columns, types)
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, name, columns, types],
  );
  const readOnly = disabled || types.length === 0;

  const updateColumn = (index: number, next: NewTableColumn) =>
    setColumns((prev) => prev.map((c, i) => (i === index ? next : c)));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || readOnly) return;
    setShowErrors(true);
    setSubmitError(null);
    if (!valid || !sql) return;
    setSubmitting(true);
    try {
      const result = await onExecute(sql);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      onCreated?.({ schema, name: name.trim() });
      setName("");
      setColumns(initialColumns());
      setShowErrors(false);
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create table",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans text-foreground"
    >
      <div className="p-4 bg-card border-b border-border flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 font-mono min-w-0">
          <Table2 className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground">
              New table
            </div>
            <div className="text-xs text-muted-foreground">
              Define columns, then create the table
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || readOnly || (showErrors && !valid)}
          className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50 shrink-0"
        >
          <Check className="w-4 h-4" />
          <span>{submitting ? "Creating…" : "Create table"}</span>
        </button>
      </div>

      {submitError && (
        <div className="px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="break-all">{submitError}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-3 max-w-2xl">
          <div>
            <label className={labelClass} htmlFor="new-table-schema">
              Schema
            </label>
            <Select
              id="new-table-schema"
              className="font-mono"
              value={schema}
              disabled={readOnly}
              aria-label="Schema"
              options={schemas.map((s) => ({ value: s, label: s }))}
              onChange={setSchema}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-table-name">
              Table name
            </label>
            <input
              id="new-table-name"
              type="text"
              autoFocus
              value={name}
              disabled={readOnly}
              placeholder="table_name"
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
            {showErrors && validation.table && (
              <div className="mt-1 text-[11px] text-rose-300">
                {validation.table}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className={labelClass}>Columns</div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                setColumns((prev) => [...prev, emptyNewTableColumn()])
              }
              className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background hover:bg-accent border border-border text-xs font-medium disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add column</span>
            </button>
          </div>
          {showErrors && validation.form && (
            <div className="text-[11px] text-rose-300">{validation.form}</div>
          )}

          {columns.map((column, index) => {
            const errors = showErrors ? (validation.columns[index] ?? {}) : {};
            return (
              <div
                key={index}
                className="rounded-xl border border-border bg-card p-3 space-y-3"
              >
                <div className="flex items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label
                      className={labelClass}
                      htmlFor={`new-column-name-${index}`}
                    >
                      Column name
                    </label>
                    <input
                      id={`new-column-name-${index}`}
                      type="text"
                      value={column.name}
                      disabled={readOnly}
                      placeholder="column_name"
                      onChange={(event) =>
                        updateColumn(index, {
                          ...column,
                          name: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                    {errors.name && (
                      <div className="mt-1 text-[11px] text-rose-300">
                        {errors.name}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs font-mono pb-2.5 shrink-0">
                    <Checkbox
                      checked={column.primaryKey}
                      aria-label="Primary key"
                      onCheckedChange={(checked) =>
                        updateColumn(index, {
                          ...column,
                          primaryKey: checked,
                          nullable: checked ? false : column.nullable,
                        })
                      }
                    />
                    Primary key
                  </label>
                  <button
                    type="button"
                    disabled={readOnly || columns.length === 1}
                    onClick={() =>
                      setColumns((prev) => prev.filter((_, i) => i !== index))
                    }
                    aria-label="Remove column"
                    className="p-2 mb-0.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <ColumnDraftFields
                  draft={column}
                  types={types}
                  tables={tables}
                  errors={errors}
                  disabled={readOnly || submitting}
                  showName={false}
                  onChange={(next) =>
                    updateColumn(index, { ...next, primaryKey: column.primaryKey })
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-background border border-primary/20 p-2.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
            SQL preview
          </div>
          <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed select-text">
            {sql || "Fill in the table and column names to preview CREATE TABLE."}
          </pre>
        </div>
      </div>
    </form>
  );
};
