export const CONNECTION_DRAG_THRESHOLD_PX = 6;

export function shouldActivateConnectionDrag(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold = CONNECTION_DRAG_THRESHOLD_PX
): boolean {
  return Math.hypot(x - startX, y - startY) >= threshold;
}

export function connectionPointerUpKind(dragActive: boolean): 'connect' | 'drop' {
  return dragActive ? 'drop' : 'connect';
}
