import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionProfile,
  SaveConnectionInput,
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
