import { engineMeta } from '@db/database';
import type { Paradigm } from '@db/shared';
import type { ConnectionProfile, SavedQuery } from '../types';

/**
 * The saved queries that can open in the active connection's query tab: shell text must never
 * load into a SQL editor, nor SQL into a document tab. A query whose connection is gone counts as SQL.
 */
export function savedQueriesFor(
  queries: SavedQuery[],
  profiles: Pick<ConnectionProfile, 'id' | 'dialect'>[],
  activeConnectionId: string | null | undefined,
): SavedQuery[] {
  const paradigmOf = (connectionId: string | null | undefined): Paradigm => {
    const profile = profiles.find((p) => p.id === connectionId);
    return (profile && engineMeta(profile.dialect)?.paradigm) || 'relational';
  };
  const active = paradigmOf(activeConnectionId);
  return queries.filter((query) => paradigmOf(query.databaseId) === active);
}
