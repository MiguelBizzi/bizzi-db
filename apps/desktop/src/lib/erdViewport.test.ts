import { describe, expect, test } from 'bun:test';
import {
  clampZoom,
  ERD_DEFAULT_ZOOM,
  ERD_MAX_ZOOM,
  ERD_MIN_ZOOM,
  centerOnWorld,
  fitBounds,
  overviewLabelFontSize,
  panViewport,
  rectsIntersect,
  visibleWorldRect,
  wheelZoomFactor,
  zoomAtPoint,
} from './erdViewport';

describe('clampZoom', () => {
  test('clamps to the min/max zoom', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.001)).toBe(ERD_MIN_ZOOM);
    expect(clampZoom(8)).toBe(ERD_MAX_ZOOM);
  });

  test('falls back for non-finite values', () => {
    expect(clampZoom(Number.NaN)).toBe(ERD_DEFAULT_ZOOM);
  });
});

describe('zoomAtPoint', () => {
  test('keeps the world point under the cursor', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const next = zoomAtPoint(viewport, 2, { x: 100, y: 50 });
    expect(next.zoom).toBe(2);
    // world (100, 50) stays at screen (100, 50)
    expect((100 - next.x) / next.zoom).toBeCloseTo(100);
    expect((50 - next.y) / next.zoom).toBeCloseTo(50);
  });
});

describe('wheelZoomFactor', () => {
  test('leaves zoom unchanged for empty or invalid deltas', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  test('scales with delta size so a light trackpad move is gentler than a mouse notch', () => {
    const light = wheelZoomFactor(8);
    const mouse = wheelZoomFactor(100);
    expect(light).toBeLessThan(1);
    expect(mouse).toBeLessThan(light);
    expect(light).toBeGreaterThan(0.96);
  });

  test('zooms in for negative deltaY', () => {
    expect(wheelZoomFactor(-8)).toBeGreaterThan(1);
  });
});

describe('panViewport', () => {
  test('shifts translation by screen deltas', () => {
    expect(panViewport({ x: 10, y: 20, zoom: 1 }, 5, -3)).toEqual({
      x: 15,
      y: 17,
      zoom: 1,
    });
  });
});

describe('fitBounds', () => {
  test('fits the graph inside the container with padding', () => {
    const viewport = fitBounds(
      { minX: 0, minY: 0, width: 400, height: 200 },
      { width: 800, height: 400 }
    );
    expect(viewport.zoom).toBeGreaterThan(0);
    expect(viewport.zoom).toBeLessThanOrEqual(ERD_MAX_ZOOM);
    expect(viewport.zoom).toBeGreaterThanOrEqual(ERD_MIN_ZOOM);
  });

  test('does not exceed max zoom for a tiny graph', () => {
    const viewport = fitBounds(
      { minX: 0, minY: 0, width: 10, height: 10 },
      { width: 800, height: 600 }
    );
    expect(viewport.zoom).toBe(ERD_MAX_ZOOM);
  });
});

describe('centerOnWorld', () => {
  test('places a world point at the container center', () => {
    const bounds = { minX: 10, minY: 20, width: 400, height: 300 };
    const viewport = centerOnWorld(1, { x: 110, y: 80 }, bounds, {
      width: 800,
      height: 400,
    });
    expect(viewport.x + (110 - bounds.minX) * viewport.zoom).toBe(400);
    expect(viewport.y + (80 - bounds.minY) * viewport.zoom).toBe(200);
  });
});

describe('visibleWorldRect', () => {
  const bounds = { minX: 10, minY: 20, width: 5000, height: 5000 };

  test('maps the container back to world coordinates', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 400 }, bounds, 0);
    expect(rect).toEqual({ left: 10, top: 20, right: 810, bottom: 420 });
  });

  test('follows pan and zoom', () => {
    // world-div point (500, 300) sits at the screen origin at zoom 0.5
    const rect = visibleWorldRect(
      { x: -250, y: -150, zoom: 0.5 },
      { width: 800, height: 400 },
      bounds,
      0
    );
    expect(rect.left).toBeCloseTo(510);
    expect(rect.top).toBeCloseTo(320);
    expect(rect.right).toBeCloseTo(510 + 1600);
    expect(rect.bottom).toBeCloseTo(320 + 800);
  });

  test('margin is in screen pixels', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, zoom: 0.5 }, { width: 800, height: 400 }, bounds, 100);
    expect(rect.left).toBeCloseTo(10 - 200);
    expect(rect.right).toBeCloseTo(10 + 1600 + 200);
  });
});

describe('rectsIntersect', () => {
  const a = { left: 0, top: 0, right: 100, bottom: 100 };
  test('detects overlap and separation', () => {
    expect(rectsIntersect(a, { left: 50, top: 50, right: 150, bottom: 150 })).toBe(true);
    expect(rectsIntersect(a, { left: 101, top: 0, right: 200, bottom: 100 })).toBe(false);
    expect(rectsIntersect(a, { left: 0, top: -50, right: 100, bottom: -1 })).toBe(false);
  });
});

describe('overviewLabelFontSize', () => {
  const card = { width: 260, height: 300 };

  test('targets a readable on-screen size when the card has room', () => {
    expect(overviewLabelFontSize('a', 0.5, card)).toBeCloseTo(26);
  });

  test('shrinks to fit long names inside the card', () => {
    const size = overviewLabelFontSize('x'.repeat(40), 0.1, card);
    expect(size * 0.6 * 40).toBeLessThanOrEqual(card.width);
  });

  test('never exceeds half the card height', () => {
    expect(overviewLabelFontSize('a', 0.05, { width: 260, height: 60 })).toBeLessThanOrEqual(30);
  });
});
