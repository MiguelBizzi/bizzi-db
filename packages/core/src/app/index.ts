import { invoke } from '@tauri-apps/api/core';

export type UpdateChannel = { selfUpdate: boolean; target: string | null };

export function appUpdateChannel(): Promise<UpdateChannel> {
  return invoke('app_update_channel');
}

export function logClientError(source: string, details: string): Promise<void> {
  return invoke('log_client_error', { source, details });
}
