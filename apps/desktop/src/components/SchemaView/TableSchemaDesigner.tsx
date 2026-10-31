import React, { useEffect, useMemo, useState } from "react";
import { columnTypesFor } from "@db/database";
import type {
  ColumnDefinition,
  DatabaseDialect,
  IndexDefinition,
  TableSchema,
} from "../../types";
import {
  ChevronRight,
  Edit3,
  Key,
  ListTree,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { tableStatParts } from "../../lib/format";
import { tableDdlFor } from "../../lib/ddl/registry";
import { dialectModule } from "@db/database";
import { objectDdlFor } from "../../lib/ddl/registry";
import {
  describeIndex,
  formatIndexSize,
  indexInsights,
} from "../../lib/indexInsights";
import { useMenuModalGate } from "../../lib/commands/useMenuModalGate";
import { SqlCodeViewer } from "../SqlEditor/SqlCodeViewer";
import {
  columnAddKey,
  columnChangeKey,
  indexChangeKey,
  type StagedSchemaChange,
} from "../../lib/schemaQueue";
import { AddColumnDrawer } from "./AddColumnDrawer";
import { EditColumnModal } from "./EditColumnModal";
import { DeleteColumnModal } from "./DeleteColumnModal";
import { IndexDrawer } from "./IndexDrawer";
import { DropIndexModal } from "./DropIndexModal";

const BADGE = "px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap";
const PENDING_BADGE = `${BADGE} bg-amber-500/10 text-amber-400 border-amber-500/30`;
const CONSTRAINT_BADGE = {
  primary: { label: "PK", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  unique: { label: "UNIQUE CONSTRAINT", className: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  exclusion: { label: "EXCLUDE", className: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
} as const;

function keyLabel(index: IndexDefinition): string {
  if (!index.keys?.length) return index.columns.join(", ");
  return index.keys
    .map((key) => {
      const base = key.isExpression ? `(${key.expression})` : key.expression;
      const nulls =
        key.nullsFirst === undefined ? "" : key.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
      return `${base}${key.descending ? " DESC" : ""}${nulls}`;
    })
    .join(", ");
}

interface TableSchemaDesignerProps {
  table: TableSchema;
  tables: TableSchema[];
  dialect?: DatabaseDialect;
  disabled?: boolean;
  serverVersionNum?: number;
  newIndexRequested?: boolean;
  onNewIndexRequestHandled?: () => void;
  onExecute: (sql: string) => Promise<{ error?: string }>;
  onStage: (change: StagedSchemaChange) => void;
  stagedKeys?: ReadonlySet<string>;
}

export const TableSchemaDesigner: React.FC<TableSchemaDesignerProps> = ({
  table,
  tables,
  dialect = "PostgreSQL",
  disabled,
  serverVersionNum,
  newIndexRequested,
  onNewIndexRequestHandled,
  onExecute,
  onStage,
  stagedKeys,
}) => {
  const [activeTab, setActiveTab] = useState<"columns" | "indexes" | "ddl">(
    "columns",
  );
  const [indexEditor, setIndexEditor] = useState<
    { index: IndexDefinition | null } | null
  >(null);
  const [dropIndex, setDropIndex] = useState<IndexDefinition | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editColumn, setEditColumn] = useState<ColumnDefinition | null>(null);
  const [deleteColumn, setDeleteColumn] = useState<ColumnDefinition | null>(
    null,
  );
  const types = useMemo(() => columnTypesFor(dialect) ?? [], [dialect]);
  const readOnly = Boolean(table.isView) || disabled || types.length === 0;
  const columns = table.columns;
  const indexes = table.indexes;
  const objectDdl = objectDdlFor(dialect);
  // Indexes can be managed on tables and materialized views, but the schema
  // doesn't tell the two kinds of view apart, so views stay read-only here.
  const indexesReadOnly = Boolean(table.isView) || disabled || !objectDdl;
  const insights = useMemo(
    () =>
      indexInsights(table, {
        invalidIndexes: dialectModule(dialect)?.capabilities.invalidIndexes !== false,
      }),
    [table, dialect],
  );

  useEffect(() => {
    if (!newIndexRequested) return;
    setActiveTab("indexes");
    if (!indexesReadOnly) setIndexEditor({ index: null });
    onNewIndexRequestHandled?.();
  }, [newIndexRequested, indexesReadOnly, onNewIndexRequestHandled]);

  useMenuModalGate(
    `schema:${table.id}`,
    addOpen ||
      editColumn != null ||
      deleteColumn != null ||
      indexEditor != null ||
      dropIndex != null,
  );

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
        {activeTab === "indexes" ? (
          <button
            type="button"
            disabled={indexesReadOnly}
            onClick={() => setIndexEditor({ index: null })}
            className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New index</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setAddOpen(true)}
            className="pressable flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add column</span>
          </button>
        )}
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
                          {stagedKeys?.has(columnChangeKey(table, column.name)) && (
                            <span className={PENDING_BADGE} title="A change to this column is waiting in Pending Changes">
                              PENDING
                            </span>
                          )}
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
            {indexes.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground space-y-2">
                <ListTree className="w-6 h-6 mx-auto opacity-60" />
                <div>No indexes on this table.</div>
                <div className="text-[11px]">
                  Index the columns your queries filter, join or sort on.
                </div>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-background border-b border-border">
                    <tr>
                      <th className="p-3 w-6" aria-label="Expand" />
                      <th className="p-3">Index Name</th>
                      <th className="p-3">Keys</th>
                      <th className="p-3">Method</th>
                      <th className="p-3 text-right">Size</th>
                      <th className="p-3 text-right">Scans</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {indexes.map((index) => {
                      const expanded = expandedIndex === index.name;
                      const notes = insights.get(index.name) ?? [];
                      const managed = index.constraint;
                      const lockedReason = managed
                        ? `Managed by constraint ${managed.name}`
                        : undefined;
                      return (
                        <React.Fragment key={index.name}>
                          <tr
                            className="hover:bg-accent/60 transition-colors cursor-pointer"
                            onClick={() => setExpandedIndex(expanded ? null : index.name)}
                          >
                            <td className="p-3 text-muted-foreground">
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                              />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-foreground">{index.name}</span>
                                {stagedKeys?.has(indexChangeKey(table, index.name)) && (
                                  <span className={PENDING_BADGE} title="A change to this index is waiting in Pending Changes">
                                    PENDING
                                  </span>
                                )}
                                {managed && (
                                  <span className={`${BADGE} ${CONSTRAINT_BADGE[managed.kind].className}`}>
                                    {CONSTRAINT_BADGE[managed.kind].label}
                                  </span>
                                )}
                                {index.isUnique && !managed && (
                                  <span className={`${BADGE} bg-emerald-500/10 text-emerald-400 border-emerald-500/30`}>
                                    UNIQUE
                                  </span>
                                )}
                                {index.predicate && (
                                  <span className={`${BADGE} bg-sky-500/10 text-sky-400 border-sky-500/30`}>
                                    PARTIAL
                                  </span>
                                )}
                                {notes.map((note) => (
                                  <span
                                    key={note.kind}
                                    title={note.message}
                                    className={`${BADGE} ${
                                      note.kind === "invalid"
                                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                    }`}
                                  >
                                    {note.label.toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-primary">
                              {keyLabel(index)}
                              {index.includeColumns && index.includeColumns.length > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  INCLUDE ({index.includeColumns.join(", ")})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">{index.type}</td>
                            <td className="p-3 text-right text-muted-foreground tabular-nums">
                              {index.sizeBytes != null ? formatIndexSize(index.sizeBytes) : "—"}
                            </td>
                            <td className="p-3 text-right text-muted-foreground tabular-nums">
                              {index.scans != null ? index.scans.toLocaleString() : "—"}
                            </td>
                            <td className="p-3 text-right" onClick={(event) => event.stopPropagation()}>
                              <div className="inline-flex items-center gap-1">
                                {managed ? (
                                  <span
                                    className="p-1 text-muted-foreground"
                                    title={`${lockedReason}. Change it with ALTER TABLE.`}
                                    aria-label={lockedReason}
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled={indexesReadOnly}
                                      onClick={() => setIndexEditor({ index })}
                                      className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-40"
                                      aria-label={`Edit ${index.name}`}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={indexesReadOnly}
                                      onClick={() => setDropIndex(index)}
                                      className="p-1 hover:bg-muted text-muted-foreground hover:text-destructive rounded transition-colors disabled:opacity-40"
                                      aria-label={`Delete ${index.name}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-background/40">
                              <td />
                              <td colSpan={6} className="p-3 pt-1 space-y-2">
                                <p className="text-muted-foreground font-sans text-xs">
                                  {describeIndex(index)}
                                  {managed && ` Managed by constraint ${managed.name}; change it with ALTER TABLE.`}
                                </p>
                                {notes.map((note) => (
                                  <p
                                    key={note.kind}
                                    className={`font-sans text-xs ${
                                      note.kind === "invalid" ? "text-rose-300" : "text-amber-300"
                                    }`}
                                  >
                                    <span className="font-bold">{note.label}:</span> {note.message}
                                  </p>
                                ))}
                                {index.definition && (
                                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                                    <SqlCodeViewer
                                      value={`${index.definition};`}
                                      lineNumbers={false}
                                      aria-label={`${index.name} definition`}
                                    />
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {indexes.some((index) => index.scans != null) && (
              <p className="mt-2 text-[10px] text-muted-foreground font-sans">
                Scans count index lookups since {dialectModule(dialect)?.label ?? dialect} statistics
                were last reset, on this server only.
              </p>
            )}
          </div>
        )}

        {activeTab === "ddl" && (
          <div className="font-mono text-xs">
            <pre className="p-4 bg-card border border-border rounded-xl text-foreground overflow-x-auto leading-relaxed">
              {tableDdlFor(dialect)?.buildTableDdlPreview(table)}
            </pre>
          </div>
        )}
      </div>

      <AddColumnDrawer
        isOpen={addOpen}
        dialect={dialect}
        table={table}
        tables={tables}
        types={types}
        disabled={disabled}
        onClose={() => setAddOpen(false)}
        onExecute={async (sql, columnName) => {
          onStage({
            key: columnAddKey(table, columnName),
            objectKind: "column",
            action: "add",
            schema: table.schema,
            name: columnName,
            parent: `${table.schema}.${table.name}`,
            title: `Add column ${columnName} to ${table.name}`,
            sql,
            transactional: dialectModule(dialect)?.capabilities.transactionalDdl !== false,
            warnings: [],
          });
          return {};
        }}
      />
      <EditColumnModal
        isOpen={editColumn != null}
        dialect={dialect}
        table={table}
        tables={tables}
        types={types}
        column={editColumn}
        disabled={disabled}
        onClose={() => setEditColumn(null)}
        onExecute={async (sql) => {
          if (!editColumn) return {};
          onStage({
            key: columnChangeKey(table, editColumn.name),
            objectKind: "column",
            action: "alter",
            schema: table.schema,
            name: editColumn.name,
            parent: `${table.schema}.${table.name}`,
            title: `Edit column ${editColumn.name} on ${table.name}`,
            sql,
            transactional: dialectModule(dialect)?.capabilities.transactionalDdl !== false,
            warnings: [],
          });
          return {};
        }}
      />
      <IndexDrawer
        isOpen={indexEditor != null}
        table={table}
        tables={tables}
        dialect={dialect}
        serverVersionNum={serverVersionNum}
        index={indexEditor?.index ?? null}
        disabled={disabled}
        onClose={() => setIndexEditor(null)}
        onExecute={onExecute}
        onStage={onStage}
      />
      <DropIndexModal
        isOpen={dropIndex != null}
        table={table}
        dialect={dialect}
        index={dropIndex}
        disabled={disabled}
        onClose={() => setDropIndex(null)}
        onStage={onStage}
      />
      <DeleteColumnModal
        isOpen={deleteColumn != null}
        dialect={dialect}
        table={table}
        column={deleteColumn}
        disabled={disabled}
        onClose={() => setDeleteColumn(null)}
        onExecute={async (sql) => {
          if (!deleteColumn) return {};
          onStage({
            key: columnChangeKey(table, deleteColumn.name),
            objectKind: "column",
            action: "drop",
            schema: table.schema,
            name: deleteColumn.name,
            parent: `${table.schema}.${table.name}`,
            title: `Delete column ${deleteColumn.name} from ${table.name}`,
            sql,
            transactional: dialectModule(dialect)?.capabilities.transactionalDdl !== false,
            warnings: [],
          });
          return {};
        }}
      />
    </div>
  );
};
