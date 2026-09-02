import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionFolder,
  ConnectionProfile,
  SaveConnectionInput,
  SaveFolderInput,
  TestConnectionResult,
} from '@db/shared';

export function connectionsList(): Promise<ConnectionProfile[]> {
  return invoke('connections_list');
}

export function connectionsSave(input: SaveConnectionInput): Promise<ConnectionProfile> {
  return invoke('connections_save', { input });
}

export function connectionsDelete(id: string): Promise<void> {
  return invoke('connections_delete', { id });
}

export function connectionsTest(input: SaveConnectionInput): Promise<TestConnectionResult> {
  return invoke('connections_test', { input });
}

export function connectionsConnect(id: string): Promise<ConnectionProfile> {
  return invoke('connections_connect', { id });
}

export function connectionsDisconnect(id: string): Promise<void> {
  return invoke('connections_disconnect', { id });
}

export function connectionsMove(
  id: string,
  folderId: string | null,
  beforeId?: string | null
): Promise<void> {
  return invoke('connections_move', { id, folderId, beforeId: beforeId ?? null });
}

export function foldersList(): Promise<ConnectionFolder[]> {
  return invoke('folders_list');
}

export function foldersSave(input: SaveFolderInput): Promise<ConnectionFolder> {
  return invoke('folders_save', { input });
}

export function foldersDelete(id: string, deleteConnections: boolean): Promise<void> {
  return invoke('folders_delete', { id, deleteConnections });
}
