import { invoke } from '@tauri-apps/api/core';
import type {
  DatabaseSchema,
  RoutineSource,
  RoutineSourceRequest,
  SchemaSyncRequest,
  SchemaSyncResponse,
} from '@db/shared';

export function schemaIntrospect(connectionId: string): Promise<DatabaseSchema> {
  return invoke('schema_introspect', { connectionId });
}

export function schemaSync(input: SchemaSyncRequest): Promise<SchemaSyncResponse> {
  return invoke('schema_sync', { input });
}

export function schemaRoutineSource(input: RoutineSourceRequest): Promise<RoutineSource> {
  return invoke('schema_routine_source', { input });
}
