import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Link, X } from 'lucide-react';
import type { DatabaseDialect, TableSchema } from '../../types';
import { registerScope, type CommandScope } from '../../lib/commands/commandBus';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { ForeignKeySheet, type FkLookupFn } from './ForeignKeySheet';

const CHOOSE_SHORTCUT = shortcutLabel('edit.chooseReferencedRow');

interface ForeignKeyFieldProps {
  id?: string;
  value: string;
  disabled?: boolean;
  nullable: boolean;
  sourceLabel: string;
  targetColumn: string;
  referencedTable: TableSchema;
  dialect: DatabaseDialect;
  onChange: (value: string) => void;
  onSetNull: () => void;
  onLookup: FkLookupFn;
}

export function ForeignKeyField({
  id,
  value,
  disabled = false,
  nullable,
  sourceLabel,
  targetColumn,
  referencedTable,
  dialect,
  onChange,
  onSetNull,
  onLookup,
}: ForeignKeyFieldProps) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const scopeRef = useRef<CommandScope | null>(null);
  const openRef = useRef(() => {});
  openRef.current = () => {
    if (disabled) return;
    setInitialQuery('');
    setOpen(true);
  };

  useEffect(() => () => scopeRef.current?.dispose(), []);

  const onFocus = () => {
    scopeRef.current?.dispose();
    const scope = registerScope(`fk-field:${id ?? sourceLabel}`, {
      'edit.chooseReferencedRow': () => openRef.current(),
    });
    scope.setContext({ foreignKeyTarget: !disabled });
    scopeRef.current = scope;
  };

  const onBlur = () => {
    scopeRef.current?.dispose();
    scopeRef.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
    // Typing on the closed field starts a search with that character.
    if (event.key.length === 1 && event.key !== ' ') {
      event.preventDefault();
      setInitialQuery(event.key);
      setOpen(true);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onChange('');
    }
  };

  return (
    <>
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          onClick={() => openRef.current()}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          title={`Choose from ${referencedTable.name} (${CHOOSE_SHORTCUT})`}
          className="group w-full h-9 pl-8 pr-14 flex items-center bg-background border border-border rounded-xl text-xs font-mono text-left focus:outline-none focus:border-primary hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Link className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
          {value ? (
            <span className="truncate text-foreground">{value}</span>
          ) : (
            <span className="truncate text-muted-foreground font-sans">
              Choose from {referencedTable.name}…
            </span>
          )}
          <ChevronRight className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </button>
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear value"
            onClick={() => onChange('')}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <ForeignKeySheet
        open={open}
        initialQuery={initialQuery}
        referencedTable={referencedTable}
        targetColumn={targetColumn}
        sourceLabel={sourceLabel}
        currentValue={value || null}
        nullable={nullable}
        dialect={dialect}
        onLookup={onLookup}
        onSelect={(next) => {
          onChange(next);
          setOpen(false);
        }}
        onSetNull={() => {
          onSetNull();
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
