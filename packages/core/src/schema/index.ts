import { invoke } from '@tauri-apps/api/core';
import type { DatabaseSchema } from '@db/shared';

export function schemaIntrospect(connectionId: string): Promise<DatabaseSchema> {
  return invoke('schema_introspect', { connectionId });
}
