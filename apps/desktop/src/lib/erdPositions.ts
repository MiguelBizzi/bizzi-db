import type { ErdPoint } from './erdLayout';

export function erdPositionsKey(databaseId: string): string {
  return `erd-layout:${databaseId}`;
}

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function isPoint(value: unknown): value is ErdPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function readErdPositions(
  storage: StorageLike,
  databaseId: string
): Record<string, ErdPoint> {
  const raw = storage.getItem(erdPositionsKey(databaseId));
  if (raw == null) return {};
  try {
    const parsed = JSON.parse(raw) as { positions?: unknown };
    const positions = parsed?.positions;
    if (!positions || typeof positions !== 'object') return {};
    const result: Record<string, ErdPoint> = {};
    for (const [id, point] of Object.entries(positions)) {
      if (isPoint(point)) result[id] = { x: point.x, y: point.y };
    }
    return result;
  } catch {
    return {};
  }
}

export function writeErdPositions(
  storage: StorageLike,
  databaseId: string,
  positions: Record<string, ErdPoint>
): void {
  storage.setItem?.(
    erdPositionsKey(databaseId),
    JSON.stringify({ positions })
  );
}

export function clearErdPositions(storage: StorageLike, databaseId: string): void {
  storage.removeItem?.(erdPositionsKey(databaseId));
}
