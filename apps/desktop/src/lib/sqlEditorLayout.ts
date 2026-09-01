export const SQL_EDITOR_RESULTS_KEY = 'sql-editor-results-fraction';
export const DEFAULT_RESULTS_FRACTION = 0.55;
export const MIN_RESULTS_FRACTION = 0.2;
export const MAX_RESULTS_FRACTION = 0.8;

export function clampResultsFraction(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RESULTS_FRACTION;
  return Math.min(MAX_RESULTS_FRACTION, Math.max(MIN_RESULTS_FRACTION, value));
}

export function readResultsFraction(storage: {
  getItem: (key: string) => string | null;
}): number {
  const raw = storage.getItem(SQL_EDITOR_RESULTS_KEY);
  if (raw == null) return DEFAULT_RESULTS_FRACTION;
  return clampResultsFraction(Number(raw));
}

export function writeResultsFraction(
  storage: { setItem: (key: string, value: string) => void },
  value: number
): void {
  storage.setItem(SQL_EDITOR_RESULTS_KEY, String(clampResultsFraction(value)));
}
