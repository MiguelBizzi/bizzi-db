import type { CollectionSchema, DatabaseSchema } from '../../types';

export function filterCollections(
  collections: CollectionSchema[],
  opts: { search: string; database: string | 'ALL' },
): CollectionSchema[] {
  const needle = opts.search.toLowerCase();
  return collections
    .filter(
      (c) =>
        (opts.database === 'ALL' || c.database === opts.database) &&
        c.name.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.database.localeCompare(b.database) || a.name.localeCompare(b.name));
}

export function collectionDatabases(schema: DatabaseSchema): string[] {
  return Array.from(new Set((schema.collections ?? []).map((c) => c.database))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** `—` means the count is unknown, which is not the same as an empty collection. */
export function collectionCountLabel(c: CollectionSchema): string {
  return c.documentCount == null ? '—' : c.documentCount.toLocaleString('en-US');
}
