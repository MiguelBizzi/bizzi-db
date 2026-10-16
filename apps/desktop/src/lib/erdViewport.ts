import type { ErdBounds } from './erdLayout';

export const ERD_MIN_ZOOM = 0.02;
export const ERD_MAX_ZOOM = 2;
export const ERD_DEFAULT_ZOOM = 1;
export const ERD_DETAIL_ZOOM = 0.4;
export const ERD_SKELETON_ZOOM = 0.12;
export const ERD_CULL_MARGIN = 240;
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

export type ErdRect = { left: number; top: number; right: number; bottom: number };

export function visibleWorldRect(
  viewport: ErdViewport,
  container: { width: number; height: number },
  bounds: Pick<ErdBounds, 'minX' | 'minY'>,
  margin = ERD_CULL_MARGIN
): ErdRect {
  const z = clampZoom(viewport.zoom);
  const pad = margin / z;
  return {
    left: -viewport.x / z + bounds.minX - pad,
    top: -viewport.y / z + bounds.minY - pad,
    right: (container.width - viewport.x) / z + bounds.minX + pad,
    bottom: (container.height - viewport.y) / z + bounds.minY + pad,
  };
}

export function rectsIntersect(a: ErdRect, b: ErdRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

// Overview cards get a label sized in world units so it stays legible on screen where
// the card is wide enough, and shrinks to fit the card where it is not.
export function overviewLabelFontSize(
  label: string,
  zoom: number,
  card: { width: number; height: number }
): number {
  const z = clampZoom(zoom);
  const fitsWidth = (card.width * 0.9) / (Math.max(label.length, 1) * 0.6);
  return Math.min(fitsWidth, 13 / z, card.height * 0.5);
}
