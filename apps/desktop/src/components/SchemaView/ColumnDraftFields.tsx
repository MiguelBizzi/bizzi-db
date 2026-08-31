import type { ReactNode } from 'react';
import type { ColumnTypeDef } from '@db/database';
import type { TableSchema } from '../../types';
import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import {
  DEFAULT_VALUE_PRESETS,
  ON_DELETE_ACTIONS,
  fkTargetOptions,
  type ColumnDraft,
} from '../../lib/schemaChange';

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed';

const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1';

export function ColumnDraftFields({
  draft,
  types,
  tables,
  errors,
  disabled,
  showName = true,
  onChange,
}: {
  draft: ColumnDraft;
  types: ColumnTypeDef[];
  tables: TableSchema[];
  errors: Record<string, string>;
  disabled?: boolean;
  showName?: boolean;
  onChange: (next: ColumnDraft) => void;
}) {
  const def = types.find((entry) => entry.id === draft.typeId);
  const fkOptions = fkTargetOptions(tables);
  const fkValue = draft.foreignKey
    ? `${draft.foreignKey.targetSchema}.${draft.foreignKey.targetTable}.${draft.foreignKey.targetColumn}`
    : '';

  const setType = (typeId: string) => {
    const next = types.find((entry) => entry.id === typeId);
    onChange({
      ...draft,
      typeId,
      length: next?.defaultLength ?? null,
      precision: next?.defaultPrecision ?? null,
      scale: next?.defaultScale ?? null,
      customType: typeId === 'custom' ? draft.customType : undefined,
    });
  };

  return (
    <div className="space-y-3">
      {showName && (
        <Field error={errors.name}>
          <label className={labelClass} htmlFor="column-draft-name">
            Column name
          </label>
          <input
            id="column-draft-name"
            type="text"
            value={draft.name}
            disabled={disabled}
            placeholder="column_name"
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className={inputClass}
          />
        </Field>
      )}

      <Field error={errors.type}>
        <label className={labelClass} htmlFor="column-draft-type">
          Data type
        </label>
        <Select
          id="column-draft-type"
          className="font-mono"
          value={draft.typeId}
          searchable
          disabled={disabled}
          aria-label="Column type"
          options={types.map((entry) => ({ value: entry.id, label: entry.label }))}
          onChange={setType}
        />
        {def?.params === 'length' && (
          <input
            type="number"
            min={1}
            disabled={disabled}
            value={draft.length ?? ''}
            onChange={(event) =>
              onChange({ ...draft, length: parseOptionalInt(event.target.value) })
            }
            aria-label="Type length"
            placeholder="Length"
            className={`${inputClass} mt-2`}
          />
        )}
        {def?.params === 'precisionScale' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              disabled={disabled}
              value={draft.precision ?? ''}
              onChange={(event) =>
                onChange({ ...draft, precision: parseOptionalInt(event.target.value) })
              }
              aria-label="Numeric precision"
              placeholder="Precision"
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={draft.scale ?? ''}
              onChange={(event) =>
                onChange({ ...draft, scale: parseOptionalInt(event.target.value) })
              }
              aria-label="Numeric scale"
              placeholder="Scale"
              className={inputClass}
            />
          </div>
        )}
        {def?.params === 'custom' && (
          <input
            type="text"
            disabled={disabled}
            value={draft.customType ?? ''}
            onChange={(event) => onChange({ ...draft, customType: event.target.value })}
            placeholder="e.g. shop.user_role"
            aria-label="Custom type"
            className={`${inputClass} mt-2`}
          />
        )}
      </Field>

      <Field>
        <label className={labelClass} htmlFor="column-draft-default">
          Default value
        </label>
        <input
          id="column-draft-default"
          type="text"
          disabled={disabled}
          value={draft.defaultValue}
          onChange={(event) => onChange({ ...draft, defaultValue: event.target.value })}
          placeholder="SQL expression, e.g. now()"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-1 mt-1.5">
          {DEFAULT_VALUE_PRESETS.map((preset) => (
            <button
              key={preset.sql}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...draft, defaultValue: preset.sql })}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold font-mono border transition-colors ${
                draft.defaultValue === preset.sql
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-muted text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <Checkbox
            checked={draft.nullable}
            onCheckedChange={(checked) => onChange({ ...draft, nullable: checked })}
            aria-label="Nullable"
          />
          Nullable
        </label>
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <Checkbox
            checked={draft.unique}
            onCheckedChange={(checked) => onChange({ ...draft, unique: checked })}
            aria-label="Unique"
          />
          Unique
        </label>
      </div>

      <Field>
        <label className={labelClass} htmlFor="column-draft-check">
          Check constraint
        </label>
        <input
          id="column-draft-check"
          type="text"
          disabled={disabled}
          value={draft.checkExpression}
          onChange={(event) => onChange({ ...draft, checkExpression: event.target.value })}
          placeholder="e.g. quantity > 0"
          className={inputClass}
        />
      </Field>

      <Field error={errors.foreignKey}>
        <label className={labelClass} htmlFor="column-draft-fk">
          Foreign key
        </label>
        <Select
          id="column-draft-fk"
          className="font-mono"
          value={fkValue}
          searchable
          disabled={disabled}
          placeholder="None"
          aria-label="Foreign key target"
          options={[
            { value: '', label: 'None' },
            ...fkOptions.map((option) => ({ value: option.value, label: option.label })),
          ]}
          onChange={(value) => {
            if (!value) {
              onChange({ ...draft, foreignKey: null });
              return;
            }
            const option = fkOptions.find((entry) => entry.value === value);
            if (!option) return;
            onChange({
              ...draft,
              foreignKey: {
                targetSchema: option.targetSchema,
                targetTable: option.targetTable,
                targetColumn: option.targetColumn,
                onDelete: draft.foreignKey?.onDelete ?? '',
              },
            });
          }}
        />
        {draft.foreignKey && (
          <div className="mt-2">
            <label className={labelClass} htmlFor="column-draft-on-delete">
              On delete
            </label>
            <Select
              id="column-draft-on-delete"
              className="font-mono"
              value={draft.foreignKey.onDelete}
              disabled={disabled}
              aria-label="Foreign key on delete"
              options={ON_DELETE_ACTIONS.map((action) => ({
                value: action.value,
                label: action.label,
              }))}
              onChange={(onDelete) =>
                onChange({
                  ...draft,
                  foreignKey: { ...draft.foreignKey!, onDelete },
                })
              }
            />
          </div>
        )}
      </Field>
    </div>
  );
}

function Field({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <div>
      {children}
      {error && <p className="mt-1 text-[11px] text-rose-300 font-mono">{error}</p>}
    </div>
  );
}

function parseOptionalInt(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
