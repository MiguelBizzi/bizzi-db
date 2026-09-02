import { describe, expect, test } from "bun:test";
import {
  canConsumeDelta,
  isNativeWheelTarget,
  mapWheelToScrollDelta,
  nextSmoothPosition,
  normalizedWheelDelta,
  overlayScrollIdleMs,
  overlayThumbMetrics,
  shouldIgnoreWheel,
  showOverlayScrollbar,
} from "./overlayScroll";

describe("overlay scrollbars", () => {
  test("stay hidden until a scroll, then fade after idle", () => {
    expect(overlayScrollIdleMs(0)).toBe(true);
    expect(overlayScrollIdleMs(400)).toBe(true);
    expect(overlayScrollIdleMs(800)).toBe(false);
    expect(overlayScrollIdleMs(1200)).toBe(false);
  });

  test("never reveals bars on intentionally hidden scrollers", () => {
    const classes = new Set<string>(["scrollbar-none"]);
    const el = {
      classList: {
        contains: (name: string) => classes.has(name),
        add: (name: string) => {
          classes.add(name);
        },
      },
    };
    expect(showOverlayScrollbar(el)).toBe(false);
    expect(classes.has("is-scrolling")).toBe(false);
  });

  test("marks a scroller as scrolling", () => {
    const classes = new Set<string>();
    const el = {
      classList: {
        contains: (name: string) => classes.has(name),
        add: (name: string) => {
          classes.add(name);
        },
      },
    };
    expect(showOverlayScrollbar(el)).toBe(true);
    expect(classes.has("is-scrolling")).toBe(true);
  });

  test("app CSS hides bars by default and paints overlay thumbs only while scrolling", async () => {
    const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
    expect(css).toMatch(/\*::-webkit-scrollbar\s*\{[^}]*width:\s*0/);
    expect(css).not.toMatch(/\.is-scrolling::-webkit-scrollbar\s*\{[^}]*width:\s*8px/);
    expect(css).toMatch(
      /\.overlay-scroll-thumb\s*\{[^}]*position:\s*fixed/,
    );
    expect(css).toMatch(
      /\.overlay-scroll-thumb\s*\{[^}]*pointer-events:\s*none/,
    );
    expect(css).toMatch(
      /\.scrollbar-none(?:\.is-scrolling)?::-webkit-scrollbar[\s\S]*width:\s*0/,
    );
  });

  test("installs overlay scrolling for the whole app", async () => {
    const main = await Bun.file(new URL("../main.tsx", import.meta.url)).text();
    expect(main).toContain("bindOverlayScroll");
  });

  test("overlay thumbs sit on the viewport edge without using layout gutters", () => {
    const box = {
      scrollTop: 100,
      scrollLeft: 50,
      scrollWidth: 400,
      scrollHeight: 1000,
      clientWidth: 200,
      clientHeight: 200,
    };
    const viewport = { top: 50, left: 10, width: 200, height: 200 };
    expect(overlayThumbMetrics(box, viewport, "y")).toEqual({
      top: 50 + (100 / 800) * (200 - 40),
      left: 10 + 200 - 8,
      width: 6,
      height: 40,
    });
    expect(overlayThumbMetrics(box, viewport, "x")).toEqual({
      top: 50 + 200 - 8,
      left: 10 + (50 / 200) * (200 - 100),
      width: 100,
      height: 6,
    });
    expect(
      overlayThumbMetrics(
        { ...box, scrollHeight: 200, scrollWidth: 200, scrollTop: 0, scrollLeft: 0 },
        viewport,
        "y",
      ),
    ).toBeNull();
  });
});

describe("smooth wheel", () => {
  test("lerps toward the target instead of jumping", () => {
    expect(nextSmoothPosition(0, 100, 0.4)).toEqual({ value: 40, done: false });
    expect(nextSmoothPosition(99.8, 100, 0.4)).toEqual({
      value: 100,
      done: true,
    });
  });

  test("normalizes line and page wheel deltas to pixels", () => {
    expect(normalizedWheelDelta(3, 0, 400)).toBe(3);
    expect(normalizedWheelDelta(3, 1, 400)).toBe(48);
    expect(normalizedWheelDelta(1, 2, 400)).toBe(400);
  });

  test("ignores pinch-zoom and already-handled gestures", () => {
    expect(
      shouldIgnoreWheel({
        ctrlKey: true,
        metaKey: false,
        defaultPrevented: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreWheel({
        ctrlKey: false,
        metaKey: true,
        defaultPrevented: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreWheel({
        ctrlKey: false,
        metaKey: false,
        defaultPrevented: true,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreWheel({
        ctrlKey: false,
        metaKey: false,
        defaultPrevented: false,
      }),
    ).toBe(false);
  });

  test("skips ERD canvas zoom handling", () => {
    expect(
      isNativeWheelTarget({ closest: (sel) => (sel === "[data-erd-canvas]" ? {} : null) }),
    ).toBe(true);
    expect(isNativeWheelTarget({ closest: () => null })).toBe(false);
    expect(isNativeWheelTarget(null)).toBe(false);
  });

  test("maps a vertical wheel onto horizontal-only overflow", () => {
    const tabs = {
      scrollLeft: 40,
      scrollTop: 0,
      scrollWidth: 400,
      scrollHeight: 40,
      clientWidth: 200,
      clientHeight: 40,
    };
    expect(mapWheelToScrollDelta(tabs, 0, 30)).toEqual({ dx: 30, dy: 0 });
    expect(mapWheelToScrollDelta(tabs, 0, -18)).toEqual({ dx: -18, dy: 0 });
    expect(mapWheelToScrollDelta(tabs, 12, 0)).toEqual({ dx: 12, dy: 0 });
    expect(mapWheelToScrollDelta({ ...tabs, scrollHeight: 48 }, 0, 24, false)).toEqual({
      dx: 24,
      dy: 0,
    });
  });

  test("leaves vertical wheels on boxes that can still scroll down", () => {
    const table = {
      scrollLeft: 0,
      scrollTop: 10,
      scrollWidth: 200,
      scrollHeight: 800,
      clientWidth: 200,
      clientHeight: 200,
    };
    expect(mapWheelToScrollDelta(table, 0, 30)).toEqual({ dx: 0, dy: 30 });
  });

  test("does not pretend a fitted strip can scroll sideways", () => {
    const fitted = {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 200,
      scrollHeight: 40,
      clientWidth: 200,
      clientHeight: 40,
    };
    expect(mapWheelToScrollDelta(fitted, 0, 30)).toEqual({ dx: 0, dy: 30 });
  });

  test("only consumes delta when the box can still move that way", () => {
    const box = {
      scrollLeft: 40,
      scrollTop: 80,
      scrollWidth: 400,
      scrollHeight: 800,
      clientWidth: 200,
      clientHeight: 200,
    };
    expect(canConsumeDelta(box, 0, 20)).toBe(true);
    expect(canConsumeDelta({ ...box, scrollTop: 0 }, 0, -20)).toBe(false);
    expect(canConsumeDelta({ ...box, scrollTop: 600 }, 0, 20)).toBe(false);
    expect(canConsumeDelta({ ...box, scrollLeft: 0 }, -20, 0)).toBe(false);
    expect(canConsumeDelta(box, 20, 0)).toBe(true);
  });
});
