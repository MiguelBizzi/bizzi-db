import { useCallback, useRef } from 'react';

export type ScrollBox = {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

export function clampedScrollAfterWheel(
  box: ScrollBox,
  deltaX: number,
  deltaY: number
): { left: number; top: number; overshoot: boolean } {
  const maxX = Math.max(0, box.scrollWidth - box.clientWidth);
  const maxY = Math.max(0, box.scrollHeight - box.clientHeight);
  const nextX = box.scrollLeft + deltaX;
  const nextY = box.scrollTop + deltaY;
  const left = Math.min(maxX, Math.max(0, nextX));
  const top = Math.min(maxY, Math.max(0, nextY));
  return { left, top, overshoot: left !== nextX || top !== nextY };
}

export function bindNoOverscroll(el: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    const next = clampedScrollAfterWheel(el, event.deltaX, event.deltaY);
    if (!next.overshoot) return;
    event.preventDefault();
    el.scrollLeft = next.left;
    el.scrollTop = next.top;
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}

export function useTableScrollPort() {
  const unbind = useRef<(() => void) | null>(null);
  return useCallback((node: HTMLDivElement | null) => {
    unbind.current?.();
    unbind.current = node ? bindNoOverscroll(node) : null;
  }, []);
}
