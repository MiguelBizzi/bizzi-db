import React, { useRef } from 'react';
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../../lib/sidebarLayout';

const KEY_STEP_PX = 16;
const KEY_STEP_LARGE_PX = 48;

interface SidebarResizeHandleProps {
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
  onDragChange?: (dragging: boolean) => void;
}

export function SidebarResizeHandle({
  width,
  onResize,
  onReset,
  onDragChange,
}: SidebarResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    onDragChange?.(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(clampSidebarWidth(drag.current.startWidth + event.clientX - drag.current.startX));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    onDragChange?.(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX;
    if (event.key === 'ArrowLeft') onResize(clampSidebarWidth(width - step));
    else if (event.key === 'ArrowRight') onResize(clampSidebarWidth(width + step));
    else if (event.key === 'Home') onResize(MIN_SIDEBAR_WIDTH);
    else if (event.key === 'End') onResize(MAX_SIDEBAR_WIDTH);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className="relative shrink-0 w-px cursor-col-resize bg-sidebar-border transition-colors hover:bg-primary/60 active:bg-primary focus-visible:outline-none focus-visible:bg-primary z-10 before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:content-['']"
    />
  );
}
