import { describe, expect, test } from 'bun:test';
import {
  clampZoom,
  ERD_DEFAULT_ZOOM,
  ERD_MAX_ZOOM,
  ERD_MIN_ZOOM,
  centerOnWorld,
  fitBounds,
  panViewport,
  wheelZoomFactor,
  zoomAtPoint,
} from './erdViewport';

describe('clampZoom', () => {
  test('clamps to 0.2–2', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.05)).toBe(ERD_MIN_ZOOM);
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
