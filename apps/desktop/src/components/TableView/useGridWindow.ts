import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import {
  GRID_COL_QUANTUM,
  GRID_HEADER_HEIGHT,
  GRID_OVERSCAN_PX,
  GRID_OVERSCAN_ROWS,
  GRID_ROW_HEIGHT,
  GRID_ROW_QUANTUM,
  computeGridRange,
  sameGridRange,
  type GridRange,
} from "../../lib/gridWindow";

const INITIAL_RANGE: GridRange = {
  rowStart: 0,
  rowEnd: 40,
  colStart: 0,
  colEnd: 16,
};

interface UseGridWindowOptions {
  portRef: RefObject<HTMLElement | null>;
  rowCount: number;
  offsets: number[];
  leadingWidth: number;
}

/**
 * Tracks which rows and columns of a scroll port are near the viewport so
 * only those are mounted. Scrolling re-renders only when the window crosses a
 * row or column boundary, and does so synchronously so fast scrolls never
 * paint an empty gap.
 */
export function useGridWindow({
  portRef,
  rowCount,
  offsets,
  leadingWidth,
}: UseGridWindowOptions): GridRange {
  const [range, setRange] = useState<GridRange>(INITIAL_RANGE);
  const rangeRef = useRef(range);
  const geometry = useRef({ rowCount, offsets, leadingWidth });
  geometry.current = { rowCount, offsets, leadingWidth };

  const update = useCallback(
    (sync: boolean) => {
      const port = portRef.current;
      if (!port) return;
      const next = computeGridRange({
        scrollTop: port.scrollTop,
        scrollLeft: port.scrollLeft,
        viewportWidth: port.clientWidth,
        viewportHeight: port.clientHeight,
        rowHeight: GRID_ROW_HEIGHT,
        headerHeight: GRID_HEADER_HEIGHT,
        overscanRows: GRID_OVERSCAN_ROWS,
        overscanPx: GRID_OVERSCAN_PX,
        rowQuantum: GRID_ROW_QUANTUM,
        colQuantum: GRID_COL_QUANTUM,
        ...geometry.current,
      });
      if (!sameGridRange(rangeRef.current, next)) {
        rangeRef.current = next;
        if (sync) flushSync(() => setRange(next));
        else setRange(next);
      }
    },
    [portRef],
  );

  // Geometry changed (new rows, new column widths): re-window before paint.
  useLayoutEffect(() => {
    update(false);
  }, [update, rowCount, offsets, leadingWidth]);

  useEffect(() => {
    const port = portRef.current;
    if (!port) return;
    const onScroll = () => update(true);
    port.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => update(false));
    observer.observe(port);
    return () => {
      port.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [portRef, update]);

  return range;
}

/** Tracks an element's content width so columns can stretch to fill it. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Width of one character of the element's monospace font; re-measured once web fonts load. */
export function useMonoCharWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(7.2);

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      if (measureContext === undefined) {
        measureContext = document.createElement("canvas").getContext("2d");
      }
      if (!measureContext) return;
      const style = getComputedStyle(el);
      measureContext.font = `${style.fontSize} ${style.fontFamily}`;
      const sample = 64;
      const next = measureContext.measureText("0".repeat(sample)).width / sample;
      if (next > 0) setWidth((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };
    measure();
    const fonts = document.fonts;
    void fonts?.ready.then(measure);
    fonts?.addEventListener?.("loadingdone", measure);
    return () => fonts?.removeEventListener?.("loadingdone", measure);
  }, [ref]);

  return width;
}
