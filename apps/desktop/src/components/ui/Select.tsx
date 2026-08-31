import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  emoji?: string;
  dotClassName?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  size?: 'sm' | 'md';
  placement?: 'top' | 'bottom';
  className?: string;
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  'aria-label': ariaLabel,
  size = 'md',
  placement = 'bottom',
  className,
  searchable = false,
  placeholder,
  disabled = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const compact = size === 'sm';
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle)
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, searchable]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className={`w-full flex items-center gap-2 bg-background border border-border text-foreground hover:border-primary/50 focus:outline-none focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          compact ? 'h-7 px-2 rounded-lg text-xs' : 'h-9 px-3 rounded-xl'
        }`}
      >
        <OptionMark option={selected} showEmoji={false} />
        <span
          className={`flex-1 text-left truncate ${
            selected ? '' : 'text-muted-foreground'
          }`}
        >
          {selected?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown
          className={`text-muted-foreground shrink-0 transition-transform ${
            compact ? 'w-3 h-3' : 'w-3.5 h-3.5'
          } ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          className={`absolute z-50 left-0 min-w-full w-max bg-popover border border-border rounded-xl shadow-lg overflow-hidden ${
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {searchable && (
            <div className="relative px-2 pt-2 pb-1">
              <Search className="w-3.5 h-3.5 absolute left-4 top-4 text-muted-foreground" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Search…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') event.preventDefault();
                }}
                className="w-full h-8 pl-7 pr-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}
          <ul
            id={listId}
            role="listbox"
            className={`py-1 max-h-56 overflow-y-auto ${searchable ? 'min-w-48' : ''}`}
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            )}
            {filtered.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 flex items-center gap-2 text-left transition-colors ${
                      compact ? 'py-1.5 text-xs' : 'py-2'
                    } ${
                      active ? 'bg-primary/15 text-primary' : 'hover:bg-accent text-foreground'
                    }`}
                  >
                    <OptionMark option={option} />
                    <span className="flex-1 whitespace-nowrap pr-2">{option.label}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionMark<T extends string>({
  option,
  showEmoji = true,
}: {
  option?: SelectOption<T>;
  showEmoji?: boolean;
}) {
  if (!option) return null;
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {option.dotClassName && (
        <span className={`w-2.5 h-2.5 rounded-full shadow-sm ${option.dotClassName}`} />
      )}
      {showEmoji && option.emoji && <span className="text-sm leading-none">{option.emoji}</span>}
    </span>
  );
}
