import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceState } from '@db/shared';

export function workspaceLoad(): Promise<WorkspaceState> {
  return invoke('workspace_load');
}

export function workspaceSave(state: WorkspaceState): Promise<void> {
  return invoke('workspace_save', { state });
}
