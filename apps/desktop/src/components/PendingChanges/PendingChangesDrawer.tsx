import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  X,
  Code,
  Columns3,
  Copy,
  ListChecks,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  ArrowRight,
  Table2,
} from 'lucide-react';
import type { PendingModifications, TableSchema } from '../../types';
import {
  PendingChangeRef,
  TablePendingBundle,
  changeKey,
  countPendingChanges,
  flattenPending,
  formatCellValue,
  primaryKeyColumn,
  sqlForAll,
  sqlForChange,
} from '../../lib/pendingChanges';

type ReviewMode = 'visual' | 'query';

interface PendingChangesDrawerProps {
  isOpen: boolean;
  pendingByTable: Record<string, PendingModifications>;
  tables: TableSchema[];
  applyingKey: string | null;
  applyingAll: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onClose: () => void;
  onApprove: (ref: PendingChangeRef) => void;
  onCancel: (ref: PendingChangeRef) => void;
  onApproveAll: () => void;
  onCancelAll: () => void;
}

export const PendingChangesDrawer: React.FC<PendingChangesDrawerProps> = ({
  isOpen,
  pendingByTable,
  tables,
  applyingKey,
  applyingAll,
  statusMessage,
  errorMessage,
  onClose,
  onApprove,
  onCancel,
  onApproveAll,
  onCancelAll,
}) => {
  const [mode, setMode] = useState<ReviewMode>('visual');
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);

  const bundles = useMemo(
    () => flattenPending(pendingByTable, tables),
    [pendingByTable, tables]
  );
  const total = countPendingChanges(pendingByTable);
  const allSql = useMemo(() => sqlForAll(bundles), [bundles]);
  const busy = applyingAll || applyingKey !== null;

  useEffect(() => {
    if (!isOpen) {
      setArmed(null);
      setMode('visual');
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!armed) return;
    const timeout = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [armed]);

  if (!isOpen) return null;

  const armOrRun = (key: string, action: () => void) => {
    if (armed === key) {
      setArmed(null);
      action();
      return;
    }
    setArmed(key);
  };

  const handleCopy = () => {
    if (!allSql) return;
    navigator.clipboard.writeText(allSql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="pending-changes-drawer fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-popover border-l border-border shadow-2xl flex flex-col font-sans select-none text-popover-foreground">
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold text-foreground">
                Pending Changes
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {total === 0
                  ? 'Nothing staged'
                  : `${total} change${total === 1 ? '' : 's'} waiting for review`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
              <ModeButton
                active={mode === 'visual'}
                onClick={() => setMode('visual')}
                icon={<Columns3 className="w-3 h-3" />}
                label="Visual"
              />
              <ModeButton
                active={mode === 'query'}
                onClick={() => setMode('query')}
                icon={<Code className="w-3 h-3" />}
                label="Query"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label="Close pending changes"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {(statusMessage || errorMessage) && (
          <div
            className={`px-4 py-2 text-[11px] font-mono border-b ${
              errorMessage
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            }`}
          >
            {errorMessage || statusMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-muted">
          {total === 0 && (
            <div className="h-full min-h-64 flex flex-col items-center justify-center text-center px-8 gap-2">
              <ListChecks className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-foreground font-medium">No pending changes</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Edit a cell or delete rows from a table. Staged work appears here
                until you approve or discard it.
              </p>
            </div>
          )}

          {mode === 'query' && total > 0 && (
            <div className="p-3 rounded-xl bg-background border border-amber-500/20 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Full script
              </div>
              <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
                {allSql}
              </pre>
            </div>
          )}

          {bundles.map((bundle) => (
            <section key={bundle.tableId} className="space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground font-mono">
                <Table2 className="w-3 h-3" />
                <span className="truncate">
                  {bundle.schema}.{bundle.tableName}
                </span>
              </div>

              {bundle.inserts.length > 0 && (
                <KindGroup
                  kind="insert"
                  label={`Inserts · ${bundle.inserts.length}`}
                >
                  {bundle.inserts.map((insert) => {
                    const ref: PendingChangeRef = {
                      kind: 'insert',
                      tableId: bundle.tableId,
                      tempId: insert.tempId,
                    };
                    return (
                      <ChangeCard
                        key={changeKey(ref)}
                        kind="insert"
                        title="New row"
                        sql={sqlForChange(bundle, ref) || ''}
                        mode={mode}
                        busy={busy}
                        applying={applyingKey === changeKey(ref)}
                        armed={armed === changeKey(ref)}
                        onArmApprove={() =>
                          armOrRun(changeKey(ref), () => onApprove(ref))
                        }
                        onCancel={() => onCancel(ref)}
                      >
                        <InsertVisual data={insert.data} />
                      </ChangeCard>
                    );
                  })}
                </KindGroup>
              )}

              {bundle.updateRows.length > 0 && (
                <KindGroup
                  kind="update"
                  label={`Updates · ${bundle.updateRows.length}`}
                >
                  {bundle.updateRows.map((row) => {
                    const ref: PendingChangeRef = {
                      kind: 'update',
                      tableId: bundle.tableId,
                      rowId: row.rowId,
                    };
                    const pk = primaryKeyColumn(bundle.table);
                    return (
                      <ChangeCard
                        key={changeKey(ref)}
                        kind="update"
                        title={`${pk} = ${formatCellValue(row.primaryKeyValue)}`}
                        sql={sqlForChange(bundle, ref) || ''}
                        mode={mode}
                        busy={busy}
                        applying={applyingKey === changeKey(ref)}
                        armed={armed === changeKey(ref)}
                        onArmApprove={() =>
                          armOrRun(changeKey(ref), () => onApprove(ref))
                        }
                        onCancel={() => onCancel(ref)}
                      >
                        <UpdateVisual cells={row.cells} />
                      </ChangeCard>
                    );
                  })}
                </KindGroup>
              )}

              {bundle.deletes.length > 0 && (
                <KindGroup
                  kind="delete"
                  label={`Deletes · ${bundle.deletes.length}`}
                >
                  {bundle.deletes.map((row) => {
                    const ref: PendingChangeRef = {
                      kind: 'delete',
                      tableId: bundle.tableId,
                      rowId: String(row.primaryKeyValue),
                    };
                    const pk = primaryKeyColumn(bundle.table);
                    return (
                      <ChangeCard
                        key={changeKey(ref)}
                        kind="delete"
                        title={`${pk} = ${formatCellValue(row.primaryKeyValue)}`}
                        sql={sqlForChange(bundle, ref) || ''}
                        mode={mode}
                        busy={busy}
                        applying={applyingKey === changeKey(ref)}
                        armed={armed === changeKey(ref)}
                        onArmApprove={() =>
                          armOrRun(changeKey(ref), () => onApprove(ref))
                        }
                        onCancel={() => onCancel(ref)}
                      >
                        <DeleteVisual
                          data={row.rowData}
                          fallbackPk={pk}
                          fallbackValue={row.primaryKeyValue}
                        />
                      </ChangeCard>
                    );
                  })}
                </KindGroup>
              )}
            </section>
          ))}
        </div>

        {total > 0 && (
          <footer className="px-4 py-3 border-t border-border bg-background/60 flex items-center justify-between gap-2 shrink-0">
            {mode === 'query' ? (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-mono border border-border transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy SQL'}</span>
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground font-mono">
                Confirm once more to apply
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => armOrRun('cancel-all', onCancelAll)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
                  armed === 'cancel-all'
                    ? 'bg-rose-600/20 text-rose-300 border-rose-500/40'
                    : 'bg-background hover:bg-accent text-foreground border-border'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{armed === 'cancel-all' ? 'Confirm discard' : 'Cancel all'}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => armOrRun('approve-all', onApproveAll)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50 ${
                  armed === 'approve-all'
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-amber-500 hover:bg-amber-400 text-amber-950'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {applyingAll
                    ? 'Applying…'
                    : armed === 'approve-all'
                      ? `Confirm ${total}`
                      : `Approve all (${total})`}
                </span>
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
};

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function KindGroup({
  kind,
  label,
  children,
}: {
  kind: 'insert' | 'update' | 'delete';
  label: string;
  children: React.ReactNode;
}) {
  const tone =
    kind === 'insert'
      ? 'text-emerald-400'
      : kind === 'delete'
        ? 'text-rose-400'
        : 'text-amber-400';
  const Icon = kind === 'insert' ? Plus : kind === 'delete' ? Trash2 : Pencil;
  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider font-mono ${tone}`}>
        <Icon className="w-3 h-3" />
        {label}
      </div>
      {children}
    </div>
  );
}

function ChangeCard({
  kind,
  title,
  sql,
  mode,
  busy,
  applying,
  armed,
  onArmApprove,
  onCancel,
  children,
}: {
  kind: 'insert' | 'update' | 'delete';
  title: string;
  sql: string;
  mode: ReviewMode;
  busy: boolean;
  applying: boolean;
  armed: boolean;
  onArmApprove: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const ring =
    kind === 'insert'
      ? 'border-emerald-500/30'
      : kind === 'delete'
        ? 'border-rose-500/30'
        : 'border-amber-500/30';
  const badge =
    kind === 'insert'
      ? 'bg-emerald-500/15 text-emerald-300'
      : kind === 'delete'
        ? 'bg-rose-500/15 text-rose-300'
        : 'bg-amber-500/15 text-amber-300';

  return (
    <article className={`rounded-xl border bg-background ${ring} overflow-hidden`}>
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badge}`}>
              {kind}
            </span>
            <span className="text-[11px] font-mono text-foreground truncate">{title}</span>
          </div>
          {mode === 'visual' ? (
            children
          ) : (
            <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
              {sql}
            </pre>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            title="Discard this change"
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-rose-300 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onArmApprove}
            title={armed ? 'Click again to apply' : 'Approve this change'}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50 ${
              armed
                ? 'bg-amber-400 text-amber-950'
                : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
            }`}
          >
            {applying ? '…' : armed ? 'Confirm' : 'Approve'}
          </button>
        </div>
      </div>
    </article>
  );
}

function InsertVisual({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="text-[11px] text-muted-foreground italic">Empty row</p>;
  }
  return (
    <div className="space-y-0.5">
      {entries.map(([column, value]) => (
        <div key={column} className="flex items-baseline gap-2 font-mono text-[11px]">
          <span className="text-muted-foreground w-24 truncate shrink-0">{column}</span>
          <span className="text-emerald-300 break-all">{formatCellValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function UpdateVisual({
  cells,
}: {
  cells: TablePendingBundle['updateRows'][number]['cells'];
}) {
  return (
    <div className="space-y-0.5">
      {cells.map((cell) => (
        <div key={cell.columnName} className="flex items-baseline gap-2 font-mono text-[11px]">
          <span className="text-muted-foreground w-24 truncate shrink-0">{cell.columnName}</span>
          <span className="text-muted-foreground/80 line-through break-all">
            {formatCellValue(cell.oldValue)}
          </span>
          <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="text-amber-200 break-all">{formatCellValue(cell.newValue)}</span>
        </div>
      ))}
    </div>
  );
}

function DeleteVisual({
  data,
  fallbackPk,
  fallbackValue,
}: {
  data: Record<string, unknown>;
  fallbackPk: string;
  fallbackValue: unknown;
}) {
  const entries = Object.entries(data);
  const rows = entries.length > 0 ? entries : [[fallbackPk, fallbackValue] as const];
  return (
    <div className="space-y-0.5">
      {rows.map(([column, value]) => (
        <div key={column} className="flex items-baseline gap-2 font-mono text-[11px]">
          <span className="text-muted-foreground w-24 truncate shrink-0">{column}</span>
          <span className="text-rose-300/90 line-through break-all">
            {formatCellValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
