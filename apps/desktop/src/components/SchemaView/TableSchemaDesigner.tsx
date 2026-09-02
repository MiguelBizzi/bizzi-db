import React, { useMemo, useState } from "react";
import { columnTypesFor } from "@db/database";
import type {
  ColumnDefinition,
  DatabaseDialect,
  TableSchema,
} from "../../types";
import { Edit3, Key, Pencil, Plus, Trash2 } from "lucide-react";
import { tableStatParts } from "../../lib/format";
import { buildTableDdlPreview } from "../../lib/schemaChange";
import { AddColumnDrawer } from "./AddColumnDrawer";
import { EditColumnModal } from "./EditColumnModal";
import { DeleteColumnModal } from "./DeleteColumnModal";

interface TableSchemaDesignerProps {
  table: TableSchema;
  tables: TableSchema[];
  dialect?: DatabaseDialect;
  disabled?: boolean;
  onExecute: (sql: string) => Promise<{ error?: string }>;
}

export const TableSchemaDesigner: React.FC<TableSchemaDesignerProps> = ({
  table,
  tables,
  dialect = "PostgreSQL",
  disabled,
  onExecute,
}) => {
  const [activeTab, setActiveTab] = useState<"columns" | "indexes" | "ddl">(
    "columns",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editColumn, setEditColumn] = useState<ColumnDefinition | null>(null);
  const [deleteColumn, setDeleteColumn] = useState<ColumnDefinition | null>(
    null,
  );
  const types = useMemo(() => columnTypesFor(dialect) ?? [], [dialect]);
  const readOnly = Boolean(table.isView) || disabled || types.length === 0;
  const columns = table.columns;
  const indexes = table.indexes;

  const tabClass = (id: typeof activeTab) =>
    `flex-1 py-2.5 px-4 font-semibold border-b-2 transition-colors ${
      activeTab === id
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      <div className="p-4 bg-card border-b border-border flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 font-mono min-w-0">
          <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground truncate">
              Schema — {table.schema}.{table.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {[
                table.isView ? "View · read-only" : `${table.schema} schema`,
                ...tableStatParts(table),
              ].join(" • ")}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add column</span>
        </button>
      </div>

      <div className="flex w-full border-b border-border bg-background font-mono text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("columns")}
          className={tabClass("columns")}
        >
          Columns ({columns.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("indexes")}
          className={tabClass("indexes")}
        >
          Indexes ({indexes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ddl")}
          className={tabClass("ddl")}
        >
          DDL Preview
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === "columns" && (
          <div className="font-mono text-xs">
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-left border-collapse">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="p-3">Column Name</th>
                    <th className="p-3">Data Type</th>
                    <th className="p-3">Attributes</th>
                    <th className="p-3">Default Value</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {columns.map((column) => (
                    <tr
                      key={column.name}
                      className="hover:bg-accent/60 transition-colors"
                    >
                      <td className="p-3 font-bold text-foreground">
                        <span className="inline-flex items-center gap-2">
                          {column.isPrimary && (
                            <Key className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span>{column.name}</span>
                        </span>
                      </td>
                      <td className="p-3 text-primary">{column.type}</td>
                      <td className="p-3 space-x-1">
                        {column.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                            PK
                          </span>
                        )}
                        {column.isNullable === false && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px]">
                            NOT NULL
                          </span>
                        )}
                        {column.isUnique && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px]">
                            UNIQUE
                          </span>
                        )}
                        {column.foreignKey && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px]">
                            FK
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono">
                        {column.defaultValue || "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setEditColumn(column)}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-40"
                            aria-label={`Edit ${column.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!column.isPrimary && (
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => setDeleteColumn(column)}
                              className="p-1 hover:bg-muted text-muted-foreground hover:text-destructive rounded transition-colors disabled:opacity-40"
                              aria-label={`Delete ${column.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "indexes" && (
          <div className="font-mono text-xs">
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-left border-collapse">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="p-3">Index Name</th>
                    <th className="p-3">Columns</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Unique</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {indexes.map((index) => (
                    <tr
                      key={index.name}
                      className="hover:bg-accent/60 transition-colors"
                    >
                      <td className="p-3 font-bold text-foreground">
                        {index.name}
                      </td>
                      <td className="p-3 text-primary">
                        {index.columns.join(", ")}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {index.type}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            index.isUnique
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {index.isUnique ? "YES" : "NO"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "ddl" && (
          <div className="font-mono text-xs">
            <pre className="p-4 bg-card border border-border rounded-xl text-foreground overflow-x-auto leading-relaxed">
              {buildTableDdlPreview(table)}
            </pre>
          </div>
        )}
      </div>

      <AddColumnDrawer
        isOpen={addOpen}
        table={table}
        tables={tables}
        types={types}
        disabled={disabled}
        onClose={() => setAddOpen(false)}
        onExecute={onExecute}
      />
      <EditColumnModal
        isOpen={editColumn != null}
        table={table}
        tables={tables}
        types={types}
        column={editColumn}
        disabled={disabled}
        onClose={() => setEditColumn(null)}
        onExecute={onExecute}
      />
      <DeleteColumnModal
        isOpen={deleteColumn != null}
        table={table}
        column={deleteColumn}
        disabled={disabled}
        onClose={() => setDeleteColumn(null)}
        onExecute={onExecute}
      />
    </div>
  );
};
