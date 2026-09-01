import React, { useRef } from 'react';
import { clampSplitSizes, type SplitDirection } from '../../lib/workspaceLayout';

const DEFAULT_MIN_PX = 80;

interface SplitHandleProps {
  direction: SplitDirection;
  onResize: (sizes: [number, number]) => void;
  minPx?: number;
}

export function SplitHandle({
  direction,
  onResize,
  minPx = DEFAULT_MIN_PX,
}: SplitHandleProps) {
  const dragging = useRef(false);
  const isRow = direction === 'row';

  const applyPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const total = isRow ? rect.width : rect.height;
    if (total <= 0) return;
    const offset = isRow ? event.clientX - rect.left : event.clientY - rect.top;
    const minFrac = Math.min(0.45, minPx / total);
    const first = Math.min(1 - minFrac, Math.max(minFrac, offset / total));
    onResize(clampSplitSizes([first, 1 - first]));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize';
    applyPointer(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    applyPointer(event);
  };

  const endDrag = () => {
    dragging.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  return (
    <div
      role="separator"
      aria-orientation={isRow ? 'vertical' : 'horizontal'}
      aria-label={isRow ? 'Resize panes' : 'Resize editor and results'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`shrink-0 bg-border hover:bg-primary/60 active:bg-primary z-10 ${
        isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      }`}
    />
  );
}
