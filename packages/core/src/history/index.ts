import { invoke } from '@tauri-apps/api/core';
import type { ActivityLogItem } from '@db/shared';

export function historyList(): Promise<ActivityLogItem[]> {
  return invoke('history_list');
}
