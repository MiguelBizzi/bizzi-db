import type { DatabaseSchema } from '../types';

export const SCHEMA_CHECK_INTERVAL_MS = 30_000;

export function shouldSkipSchemaIntrospect(
  force: boolean,
  lastFingerprint: string | undefined,
  nextFingerprint: string
): boolean {
  return !force && lastFingerprint === nextFingerprint;
}

export function mergeExplorerTags(
  previous: DatabaseSchema | undefined,
  incoming: DatabaseSchema
): DatabaseSchema {
  if (!previous) return incoming;
  const tagsById = new Map(previous.tables.map((table) => [table.id, table.tags]));
  return {
    ...incoming,
    tables: incoming.tables.map((table) => {
      const tags = tagsById.get(table.id);
      return tags && tags.length > 0 ? { ...table, tags } : table;
    }),
  };
}

export function createSchemaSyncQueue(run: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let queued = false;

  const enqueue = (): Promise<void> => {
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        await run();
      } finally {
        inFlight = null;
        if (queued) {
          queued = false;
          void enqueue();
        }
      }
    })();
    return inFlight;
  };

  return enqueue;
}
