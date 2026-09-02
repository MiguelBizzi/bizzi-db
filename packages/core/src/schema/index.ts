import { invoke } from '@tauri-apps/api/core';
import type { DatabaseSchema, SchemaSyncRequest, SchemaSyncResponse } from '@db/shared';

export function schemaIntrospect(connectionId: string): Promise<DatabaseSchema> {
  return invoke('schema_introspect', { connectionId });
}

export function schemaSync(input: SchemaSyncRequest): Promise<SchemaSyncResponse> {
  return invoke('schema_sync', { input });
}
