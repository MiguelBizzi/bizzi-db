import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Key,
  Link,
  Plus,
  X,
} from 'lucide-react';
import type { ColumnDefinition, TableSchema } from '../../types';
import { Select } from '../ui/Select';
import { ForeignKeyPicker, type FkLookupFn } from './ForeignKeyPicker';
import {
  buildInsertSql,
  enumValuesFor,
  hasDefault,
  initialFields,
  isBooleanType,
  isLongTextType,
  isNullable,
  isRequired,
  isTimestampType,
  validateFields,
  type InsertFieldMode,
  type InsertFieldState,
} from '../../lib/insertRow';
import { resolveReferencedTable } from '../../lib/foreignKeyLookup';

interface InsertRowDrawerProps {
  isOpen: boolean;
  table: TableSchema;
  tables: TableSchema[];
  onClose: () => void;
  onInsert: (sql: string) => Promise<{ error?: string }>;
  onLookup: FkLookupFn;
}

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed';

export const InsertRowDrawer: React.FC<InsertRowDrawerProps> = ({
  isOpen,
  table,
  tables,
  onClose,
  onInsert,
  onLookup,
}) => {
  const [fields, setFields] = useState<Record<string, InsertFieldState>>(() =>
    initialFields(table.columns)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [armed, setArmed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFields(initialFields(table.columns));
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
    setArmed(false);
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [isOpen, table.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!armed) return;
    const timeout = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [armed]);

  const sql = useMemo(() => buildInsertSql(table, fields), [table, fields]);
  const requiredCount = table.columns.filter(isRequired).length;
  const missingRequired = table.columns.filter((column) => {
    const field = fields[column.name];
    return isRequired(column) && field?.mode === 'value' && field.input.trim() === '';
  }).length;

  if (!isOpen) return null;

  const patchField = (name: string, next: Partial<InsertFieldState>) => {
    setArmed(false);
    setFields((prev) => ({
      ...prev,
      [name]: { ...(prev[name] ?? { mode: 'value', input: '' }), ...next },
    }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _, ...rest } = prev;
      return rest;
    });
  };

  const setMode = (name: string, mode: InsertFieldMode) => {
    patchField(name, { mode });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateFields(table.columns, fields);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) {
      setArmed(false);
      const first = table.columns.find((column) => nextErrors[column.name]);
      if (first) {
        document.getElementById(`insert-field-${first.name}`)?.focus();
      }
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await onInsert(sql);
      if (result.error) {
        setSubmitError(result.error);
        setArmed(false);
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to insert row');
      setArmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-row-title"
        className="insert-row-drawer fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-popover border-l border-border shadow-2xl flex flex-col font-sans text-popover-foreground outline-none"
      >
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div id="insert-row-title" className="font-mono text-xs font-bold text-foreground">
                Add row
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {table.schema}.{table.name}
                {requiredCount > 0
                  ? ` · ${requiredCount} required field${requiredCount === 1 ? '' : 's'}`
                  : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close insert row"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {submitError && (
          <div className="px-4 py-2 text-[11px] font-mono border-b bg-rose-500/10 text-rose-300 border-rose-500/20 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-all">{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin scrollbar-thumb-muted">
            {table.columns.map((column) => (
              <ColumnField
                key={column.name}
                column={column}
                sourceTable={table}
                tables={tables}
                field={fields[column.name] ?? { mode: 'value', input: '' }}
                error={errors[column.name]}
                onModeChange={(mode) => setMode(column.name, mode)}
                onInputChange={(input) => patchField(column.name, { mode: 'value', input })}
                onLookup={onLookup}
              />
            ))}
          </div>

          <footer className="px-4 py-3 border-t border-border bg-background/60 space-y-2.5 shrink-0">
            <div className="rounded-xl bg-background border border-emerald-500/20 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                SQL preview
              </div>
              <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
                {sql}
              </pre>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground font-mono">
                {missingRequired > 0
                  ? `${missingRequired} required field${missingRequired === 1 ? '' : 's'} remaining`
                  : armed
                    ? 'Click again to apply'
                    : 'Review values, then insert'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2.5 py-1.5 rounded-lg bg-background hover:bg-accent text-foreground border border-border text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50 ${
                    armed
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {submitting ? 'Inserting…' : armed ? 'Confirm insert' : 'Insert row'}
                  </span>
                </button>
              </div>
            </div>
          </footer>
        </form>
      </aside>
    </>
  );
};

function ColumnField({
  column,
  sourceTable,
  tables,
  field,
  error,
  onModeChange,
  onInputChange,
  onLookup,
}: {
  column: ColumnDefinition;
  sourceTable: TableSchema;
  tables: TableSchema[];
  field: InsertFieldState;
  error?: string;
  onModeChange: (mode: InsertFieldMode) => void;
  onInputChange: (input: string) => void;
  onLookup: FkLookupFn;
}) {
  const required = isRequired(column);
  const nullable = isNullable(column);
  const withDefault = hasDefault(column);
  const timestamp = isTimestampType(column.type);
  const enums = enumValuesFor(column);
  const booleanField = isBooleanType(column.type);
  const longText = isLongTextType(column.type);
  const disabled = field.mode !== 'value';
  const fieldId = `insert-field-${column.name}`;
  const invalid = Boolean(error);
  const referencedTable = column.foreignKey
    ? resolveReferencedTable(tables, sourceTable, column.foreignKey)
    : undefined;
  const fkHint = column.foreignKey
    ? ` · → ${
        column.foreignKey.targetSchema
          ? `${column.foreignKey.targetSchema}.`
          : ''
      }${column.foreignKey.targetTable}.${column.foreignKey.targetColumn}`
    : '';

  return (
    <div
      className={`rounded-xl border bg-background p-3 space-y-2 ${
        invalid ? 'border-rose-500/40' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={fieldId} className="min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
            {column.isPrimary && <Key className="w-3 h-3 text-amber-400 shrink-0" />}
            {column.foreignKey && <Link className="w-3 h-3 text-primary shrink-0" />}
            <span className="truncate">{column.name}</span>
            {required && <span className="text-destructive">*</span>}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
            {column.type}
            {fkHint}
            {column.defaultValue ? ` · DEFAULT ${truncate(column.defaultValue, 40)}` : ''}
            {!nullable ? ' · NOT NULL' : ' · nullable'}
          </div>
        </label>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {withDefault && (
            <ModeChip
              active={field.mode === 'default'}
              onClick={() => onModeChange(field.mode === 'default' ? 'value' : 'default')}
              label="Default"
            />
          )}
          {nullable && (
            <ModeChip
              active={field.mode === 'null'}
              onClick={() => onModeChange(field.mode === 'null' ? 'value' : 'null')}
              label="NULL"
            />
          )}
          {timestamp && (
            <ModeChip
              active={field.mode === 'now'}
              onClick={() => onModeChange(field.mode === 'now' ? 'value' : 'now')}
              label="now()"
              icon={<Clock className="w-3 h-3" />}
            />
          )}
        </div>
      </div>

      {column.foreignKey && referencedTable ? (
        <ForeignKeyPicker
          id={fieldId}
          value={field.input}
          disabled={disabled}
          targetColumn={column.foreignKey.targetColumn}
          referencedTable={referencedTable}
          onChange={onInputChange}
          onLookup={onLookup}
          placeholder={`Search ${referencedTable.name} or type an ID`}
        />
      ) : enums.length > 0 ? (
        <Select
          id={fieldId}
          value={(field.mode === 'value' ? field.input : '') as string}
          options={enums.map((value) => ({ value, label: value }))}
          onChange={onInputChange}
          placeholder="Select a value…"
          searchable={enums.length > 8}
          disabled={disabled}
          aria-label={column.name}
        />
      ) : booleanField ? (
        <Select
          id={fieldId}
          value={(field.mode === 'value' ? field.input : '') as string}
          options={[
            { value: 'true', label: 'TRUE' },
            { value: 'false', label: 'FALSE' },
          ]}
          onChange={onInputChange}
          placeholder="Select a value…"
          disabled={disabled}
          aria-label={column.name}
        />
      ) : longText ? (
        <textarea
          id={fieldId}
          disabled={disabled}
          rows={column.type.toLowerCase().includes('json') ? 4 : 3}
          value={disabled ? modePlaceholder(field.mode, column) : field.input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholderFor(column)}
          className={`${inputClass} resize-y min-h-18`}
        />
      ) : (
        <input
          id={fieldId}
          disabled={disabled}
          type="text"
          value={disabled ? modePlaceholder(field.mode, column) : field.input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholderFor(column)}
          className={inputClass}
        />
      )}

      {error && <p className="text-[11px] text-rose-300 font-mono">{error}</p>}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold font-mono border transition-colors ${
        active
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          : 'bg-muted text-muted-foreground border-border hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function placeholderFor(column: ColumnDefinition): string {
  if (isRequired(column)) return 'Required';
  if (hasDefault(column)) return 'Leave empty to use default';
  return 'Enter a value';
}

function modePlaceholder(mode: InsertFieldMode, column: ColumnDefinition): string {
  if (mode === 'null') return 'NULL';
  if (mode === 'now') return 'now()';
  if (mode === 'default') return column.defaultValue || 'DEFAULT';
  return '';
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
