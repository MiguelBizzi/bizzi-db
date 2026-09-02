import type { ScrollBox } from "./tableScroll";

export const SCROLLING_CLASS = "is-scrolling";
export const OVERLAY_SCROLL_FADE_MS = 800;
export const SMOOTH_SCROLL_FACTOR = 0.38;

type ClassListLike = {
  contains: (name: string) => boolean;
  add: (name: string) => void;
};

type ClosestLike = {
  closest?: (selector: string) => unknown;
};

export function overlayScrollIdleMs(
  idleMs: number,
  fadeMs = OVERLAY_SCROLL_FADE_MS,
): boolean {
  return idleMs < fadeMs;
}

export function showOverlayScrollbar(el: { classList: ClassListLike }): boolean {
  if (el.classList.contains("scrollbar-none")) return false;
  el.classList.add(SCROLLING_CLASS);
  return true;
}

export function nextSmoothPosition(
  current: number,
  target: number,
  factor = SMOOTH_SCROLL_FACTOR,
): { value: number; done: boolean } {
  const delta = target - current;
  if (Math.abs(delta) < 0.4) return { value: target, done: true };
  return { value: current + delta * factor, done: false };
}

export function normalizedWheelDelta(
  delta: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

export function shouldIgnoreWheel(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.defaultPrevented;
}

export function isNativeWheelTarget(target: ClosestLike | null): boolean {
  return Boolean(target?.closest?.("[data-erd-canvas]"));
}

export function canConsumeDelta(
  box: ScrollBox,
  dx: number,
  dy: number,
): boolean {
  const maxX = Math.max(0, box.scrollWidth - box.clientWidth);
  const maxY = Math.max(0, box.scrollHeight - box.clientHeight);
  if (dy < 0 && box.scrollTop > 0) return true;
  if (dy > 0 && box.scrollTop < maxY) return true;
  if (dx < 0 && box.scrollLeft > 0) return true;
  if (dx > 0 && box.scrollLeft < maxX) return true;
  return false;
}

/** Tab strips and other overflow-x rows should take a vertical wheel as sideways motion. */
export function mapWheelToScrollDelta(
  box: ScrollBox,
  dx: number,
  dy: number,
  allowsVertical?: boolean,
): { dx: number; dy: number } {
  const maxX = Math.max(0, box.scrollWidth - box.clientWidth);
  const maxY = Math.max(0, box.scrollHeight - box.clientHeight);
  const vertical = allowsVertical ?? maxY > 0;
  if (maxX > 0 && !vertical && dx === 0 && dy !== 0) {
    return { dx: dy, dy: 0 };
  }
  return { dx, dy };
}

function overflowCanScroll(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function isCssScrollable(style: CSSStyleDeclaration): boolean {
  return overflowCanScroll(style.overflowX) || overflowCanScroll(style.overflowY);
}

const THUMB_SIZE = 6;
const THUMB_EDGE = 8;
const MIN_THUMB = 24;

export type OverlayViewport = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type OverlayThumbRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function overlayThumbMetrics(
  box: ScrollBox,
  viewport: OverlayViewport,
  axis: "x" | "y",
): OverlayThumbRect | null {
  if (axis === "y") {
    const maxScroll = box.scrollHeight - box.clientHeight;
    if (maxScroll <= 1) return null;
    const height = Math.max(
      MIN_THUMB,
      (box.clientHeight / box.scrollHeight) * viewport.height,
    );
    const travel = Math.max(0, viewport.height - height);
    return {
      top: viewport.top + (box.scrollTop / maxScroll) * travel,
      left: viewport.left + viewport.width - THUMB_EDGE,
      width: THUMB_SIZE,
      height,
    };
  }
  const maxScroll = box.scrollWidth - box.clientWidth;
  if (maxScroll <= 1) return null;
  const width = Math.max(
    MIN_THUMB,
    (box.clientWidth / box.scrollWidth) * viewport.width,
  );
  const travel = Math.max(0, viewport.width - width);
  return {
    top: viewport.top + viewport.height - THUMB_EDGE,
    left: viewport.left + (box.scrollLeft / maxScroll) * travel,
    width,
    height: THUMB_SIZE,
  };
}

function applyThumbRect(el: HTMLElement, rect: OverlayThumbRect | null) {
  if (!rect) {
    el.style.opacity = "0";
    return;
  }
  el.style.opacity = "1";
  el.style.top = `${rect.top}px`;
  el.style.left = `${rect.left}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function ensureThumb(doc: Document, axis: "x" | "y"): HTMLElement {
  const id = `overlay-scroll-thumb-${axis}`;
  const existing = doc.getElementById(id);
  if (existing instanceof HTMLElement) return existing;
  const thumb = doc.createElement("div");
  thumb.id = id;
  thumb.className = "overlay-scroll-thumb";
  thumb.setAttribute("aria-hidden", "true");
  doc.body.appendChild(thumb);
  return thumb;
}

type AnimState = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  raf: number;
};

export function bindOverlayScroll(root: Document | HTMLElement = document): () => void {
  const fadeTimers = new WeakMap<HTMLElement, number>();
  const anims = new WeakMap<HTMLElement, AnimState>();
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const thumbX = ensureThumb(doc, "x");
  const thumbY = ensureThumb(doc, "y");

  const paint = (el: HTMLElement) => {
    const viewport = el.getBoundingClientRect();
    applyThumbRect(thumbY, overlayThumbMetrics(el, viewport, "y"));
    applyThumbRect(thumbX, overlayThumbMetrics(el, viewport, "x"));
  };

  const hideThumbs = () => {
    applyThumbRect(thumbX, null);
    applyThumbRect(thumbY, null);
  };

  const reveal = (el: HTMLElement) => {
    if (!showOverlayScrollbar(el)) {
      hideThumbs();
      return;
    }
    paint(el);
    const prev = fadeTimers.get(el);
    if (prev) window.clearTimeout(prev);
    fadeTimers.set(
      el,
      window.setTimeout(() => {
        el.classList.remove(SCROLLING_CLASS);
        fadeTimers.delete(el);
        hideThumbs();
      }, OVERLAY_SCROLL_FADE_MS),
    );
  };

  const tick = (el: HTMLElement, state: AnimState) => {
    const nx = nextSmoothPosition(state.x, state.tx);
    const ny = nextSmoothPosition(state.y, state.ty);
    state.x = nx.value;
    state.y = ny.value;
    el.scrollLeft = state.x;
    el.scrollTop = state.y;
    paint(el);
    if (!nx.done || !ny.done) {
      state.raf = window.requestAnimationFrame(() => tick(el, state));
    } else {
      state.raf = 0;
    }
  };

  const animate = (el: HTMLElement, dx: number, dy: number) => {
    let state = anims.get(el);
    if (!state || state.raf === 0) {
      state = {
        x: el.scrollLeft,
        y: el.scrollTop,
        tx: el.scrollLeft,
        ty: el.scrollTop,
        raf: 0,
      };
      anims.set(el, state);
    }
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
    const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
    state.tx = Math.min(maxX, Math.max(0, state.tx + dx));
    state.ty = Math.min(maxY, Math.max(0, state.ty + dy));
    if (!state.raf) {
      state.raf = window.requestAnimationFrame(() => tick(el, state));
    }
  };

  const onWheel = (event: Event) => {
    if (!(event instanceof WheelEvent)) return;
    if (shouldIgnoreWheel(event)) return;
    if (isNativeWheelTarget(event.target)) return;

    let node: Element | null =
      event.target instanceof Element ? event.target : null;
    while (node) {
      if (node instanceof HTMLElement) {
        const style = getComputedStyle(node);
        if (!isCssScrollable(style)) {
          node = node.parentElement;
          continue;
        }
        const rawDx = normalizedWheelDelta(
          event.deltaX,
          event.deltaMode,
          node.clientWidth,
        );
        const rawDy = normalizedWheelDelta(
          event.deltaY,
          event.deltaMode,
          node.clientHeight,
        );
        const { dx, dy } = mapWheelToScrollDelta(
          node,
          rawDx,
          rawDy,
          overflowCanScroll(style.overflowY),
        );
        if (dx === 0 && dy === 0) return;
        if (canConsumeDelta(node, dx, dy)) {
          event.preventDefault();
          animate(node, dx, dy);
          reveal(node);
          return;
        }
      }
      node = node.parentElement;
    }
  };

  const onScroll = (event: Event) => {
    const el = event.target;
    if (!(el instanceof HTMLElement) || el === document.documentElement) return;
    reveal(el);
  };

  root.addEventListener("wheel", onWheel, { capture: true, passive: false });
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    root.removeEventListener("wheel", onWheel, true);
    root.removeEventListener("scroll", onScroll, true);
    thumbX.remove();
    thumbY.remove();
  };
}
