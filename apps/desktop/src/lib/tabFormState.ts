import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Only the active tab's content is mounted, so a form inside a tab loses its
 * state when the user switches away. This keeps it per tab until the tab closes.
 */
export function createTabFormStore() {
  const byTab = new Map<string, Map<string, unknown>>();
  return {
    has(tabId: string, field: string): boolean {
      return byTab.get(tabId)?.has(field) ?? false;
    },
    read<T>(tabId: string, field: string): T | undefined {
      return byTab.get(tabId)?.get(field) as T | undefined;
    },
    write(tabId: string, field: string, value: unknown): void {
      let fields = byTab.get(tabId);
      if (!fields) {
        fields = new Map();
        byTab.set(tabId, fields);
      }
      fields.set(field, value);
    },
    prune(liveTabIds: Iterable<string>): void {
      const live = new Set(liveTabIds);
      for (const tabId of [...byTab.keys()]) if (!live.has(tabId)) byTab.delete(tabId);
    },
  };
}

const store = createTabFormStore();

export const pruneTabFormState = (liveTabIds: Iterable<string>) => store.prune(liveTabIds);

/**
 * `useState` that survives the tab being switched away and back. Without a
 * `tabId` it is plain component state.
 */
export function useTabFormState<T>(
  tabId: string | undefined,
  field: string,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (tabId && store.has(tabId, field)) return store.read<T>(tabId, field) as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    if (tabId) store.write(tabId, field, value);
  }, [tabId, field, value]);
  return [value, setValue];
}
