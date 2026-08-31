import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
  onSelect?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const PANEL =
  'min-w-44 bg-popover border border-border rounded-xl shadow-2xl p-1.5 text-xs text-popover-foreground';

const ITEM =
  'w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left font-sans text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-transparent';

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y, items]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={`fixed z-[220] ${PANEL}`}
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) => (
        <MenuRow key={item.id} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body
  );
}

function MenuRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    setFlip(rect.right + 196 > window.innerWidth);
  }, [open]);

  const body = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        {item.icon}
        <span className="truncate">{item.label}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0 min-w-0">
        {item.hint ? (
          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-28">
            {item.hint}
          </span>
        ) : null}
        {item.submenu ? (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : null}
      </span>
    </>
  );

  if (item.submenu) {
    return (
      <div
        ref={rowRef}
        className="relative"
        onMouseEnter={() => {
          if (!item.disabled) setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={item.disabled}
          className={ITEM}
          onClick={() => {
            if (!item.disabled) setOpen((current) => !current);
          }}
        >
          {body}
        </button>
        {open && !item.disabled && (
          <div
            role="menu"
            className={`absolute top-0 z-10 ${PANEL} ${
              flip ? 'right-full mr-1' : 'left-full ml-1'
            }`}
          >
            {item.submenu.map((child) => (
              <MenuRow key={child.id} item={child} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      className={ITEM}
      onClick={() => {
        if (item.disabled) return;
        item.onSelect?.();
        onClose();
      }}
    >
      {body}
    </button>
  );
}
