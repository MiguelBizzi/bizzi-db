import { invoke } from '@tauri-apps/api/core';

export type UpdateChannel = { selfUpdate: boolean; target: string | null };

export function appUpdateChannel(): Promise<UpdateChannel> {
  return invoke('app_update_channel');
}
