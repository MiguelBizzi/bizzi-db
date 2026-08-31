import { useEffect, useState } from 'react';

/** Delay before table search is applied. Tuned for a snappy feel without a request per keystroke. */
export const SEARCH_DEBOUNCE_MS = 350;

export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
