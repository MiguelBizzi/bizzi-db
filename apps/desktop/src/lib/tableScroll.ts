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
  deltaY: number,
): { left: number; top: number; overshoot: boolean } {
  const maxX = Math.max(0, box.scrollWidth - box.clientWidth);
  const maxY = Math.max(0, box.scrollHeight - box.clientHeight);
  const nextX = box.scrollLeft + deltaX;
  const nextY = box.scrollTop + deltaY;
  const left = Math.min(maxX, Math.max(0, nextX));
  const top = Math.min(maxY, Math.max(0, nextY));
  return { left, top, overshoot: left !== nextX || top !== nextY };
}
