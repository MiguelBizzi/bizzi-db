import type { ErdBounds } from './erdLayout';

export const ERD_MIN_ZOOM = 0.2;
export const ERD_MAX_ZOOM = 2;
export const ERD_DEFAULT_ZOOM = 1;
export const ERD_FIT_PADDING = 48;
export const ERD_WHEEL_ZOOM_SENSITIVITY = 220;

export type ErdViewport = {
  x: number;
  y: number;
  zoom: number;
};

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ERD_DEFAULT_ZOOM;
  return Math.min(ERD_MAX_ZOOM, Math.max(ERD_MIN_ZOOM, value));
}

export function panViewport(
  viewport: ErdViewport,
  dx: number,
  dy: number
): ErdViewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

export function zoomAtPoint(
  viewport: ErdViewport,
  nextZoom: number,
  point: { x: number; y: number }
): ErdViewport {
  const zoom = clampZoom(nextZoom);
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  return {
    zoom,
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
  };
}

export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  let pixels = deltaY;
  if (deltaMode === 1) pixels *= 16;
  if (deltaMode === 2) pixels *= 400;
  return Math.min(1.28, Math.max(0.78, Math.exp(-pixels / ERD_WHEEL_ZOOM_SENSITIVITY)));
}

export function fitBounds(
  bounds: ErdBounds,
  container: { width: number; height: number },
  padding = ERD_FIT_PADDING
): ErdViewport {
  const availW = Math.max(1, container.width - padding * 2);
  const availH = Math.max(1, container.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availW / Math.max(bounds.width, 1), availH / Math.max(bounds.height, 1))
  );
  const x = (container.width - bounds.width * zoom) / 2 - bounds.minX * zoom;
  const y = (container.height - bounds.height * zoom) / 2 - bounds.minY * zoom;
  return { x, y, zoom };
}

export function centerOnWorld(
  zoom: number,
  world: { x: number; y: number },
  bounds: ErdBounds,
  container: { width: number; height: number }
): ErdViewport {
  const z = clampZoom(zoom);
  return {
    zoom: z,
    x: container.width / 2 - (world.x - bounds.minX) * z,
    y: container.height / 2 - (world.y - bounds.minY) * z,
  };
}
