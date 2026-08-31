import { invoke } from '@tauri-apps/api/core';
import type { SavedQuery } from '@db/shared';

export function savedQueriesList(): Promise<SavedQuery[]> {
  return invoke('saved_queries_list');
}

export function savedQueriesSave(query: SavedQuery): Promise<SavedQuery> {
  return invoke('saved_queries_save', { query });
}

export function savedQueriesDelete(id: string): Promise<void> {
  return invoke('saved_queries_delete', { id });
}

export function savedQueriesUpdateTags(id: string, tags: string[]): Promise<void> {
  return invoke('saved_queries_update_tags', { id, tags });
}
