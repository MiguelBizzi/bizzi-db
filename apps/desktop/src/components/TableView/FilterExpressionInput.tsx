import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDefinition } from '../../types';
import {
  applyFilterCompletion,
  filterExpressionCompletions,
  type FilterCompletion,
} from '../../lib/filterExpression';

interface FilterExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => boolean;
  columns: ColumnDefinition[];
  valueHints: Record<string, string[]>;
  error: string | null;
}

export function FilterExpressionInput({
  value,
  onChange,
  onSubmit,
  columns,
  valueHints,
  error,
}: FilterExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const completions = useMemo(
    () => filterExpressionCompletions(value, cursor, columns, valueHints),
    [value, cursor, columns, valueHints]
  );
  const showMenu = open && completions.length > 0;

  useEffect(() => {
    setHighlighted(0);
  }, [value, cursor, showMenu]);

  useEffect(() => {
    if (!showMenu) {
      setMenuBox(null);
      return;
    }
    const updateBox = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    updateBox();
    window.addEventListener('resize', updateBox);
    document.addEventListener('scroll', updateBox, true);
    return () => {
      window.removeEventListener('resize', updateBox);
      document.removeEventListener('scroll', updateBox, true);
    };
  }, [showMenu, value]);

  useEffect(() => {
    if (!showMenu) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [showMenu]);

  const applyItem = (item: FilterCompletion) => {
    const next = applyFilterCompletion(value, cursor, item);
    onChange(next.text);
    setCursor(next.cursor);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
      inputRef.current?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (showMenu) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (event.key === 'Enter') {
      const caret = event.currentTarget.selectionStart ?? value.length;
      if (caret === value.length && onSubmit(value)) {
        event.preventDefault();
        setOpen(false);
        event.currentTarget.blur();
        return;
      }
      if (!showMenu) return;
      const item = completions[highlighted];
      if (!item) return;
      event.preventDefault();
      applyItem(item);
      return;
    }
    if (!showMenu) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % completions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + completions.length) % completions.length);
    }
  };

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        spellCheck={false}
        placeholder="Write a condition, then press Enter"
        aria-label="Filter expression"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showMenu}
        aria-invalid={Boolean(error)}
        className={`w-full bg-card border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none ${
          error ? 'border-destructive focus:border-destructive' : 'border-border focus:border-primary'
        }`}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (menuRef.current?.contains(document.activeElement)) return;
            setOpen(false);
          }, 0);
        }}
        onChange={(event) => {
          setOpen(true);
          setCursor(event.target.selectionStart ?? event.target.value.length);
          onChange(event.target.value);
        }}
        onClick={(event) => {
          setCursor(event.currentTarget.selectionStart ?? value.length);
          setOpen(true);
        }}
        onKeyUp={(event) => {
          setCursor(event.currentTarget.selectionStart ?? value.length);
        }}
        onKeyDown={onKeyDown}
      />
      {error && (
        <p className="text-[11px] text-destructive font-mono" role="alert">
          {error}
        </p>
      )}
      {showMenu &&
        menuBox &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
            style={{
              left: menuBox.left,
              width: menuBox.width,
              top: menuBox.top + 4,
            }}
          >
            <ul id={listId} role="listbox" className="py-1 max-h-56 overflow-y-auto">
              {completions.map((item, index) => {
                const active = index === highlighted;
                return (
                  <li key={`${item.type}-${item.label}-${item.from}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`w-full px-3 py-1.5 min-w-0 flex items-center justify-between gap-2 text-left text-xs font-mono transition-colors ${
                        active ? 'bg-primary/15 text-primary' : 'hover:bg-accent text-foreground'
                      }`}
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyItem(item)}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
