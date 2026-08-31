import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

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
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const compact = size === 'sm';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={`w-full flex items-center gap-2 bg-background border border-border text-foreground hover:border-primary/50 focus:outline-none focus:border-primary transition-colors ${
          compact ? 'h-7 px-2 rounded-lg text-xs' : 'h-9 px-3 rounded-xl'
        }`}
      >
        <OptionMark option={selected} showEmoji={false} />
        <span className="flex-1 text-left truncate">{selected?.label}</span>
        <ChevronDown
          className={`text-muted-foreground shrink-0 transition-transform ${
            compact ? 'w-3 h-3' : 'w-3.5 h-3.5'
          } ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-50 left-0 min-w-full w-max py-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden ${
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {options.map((option) => {
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
