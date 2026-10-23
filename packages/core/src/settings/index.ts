import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '@db/shared';

export function settingsGet(): Promise<AppSettings> {
  return invoke('settings_get');
}

export function settingsSave(settings: AppSettings): Promise<AppSettings> {
  return invoke('settings_save', { settings });
}

export function keychainAvailable(): Promise<boolean> {
  return invoke('keychain_available');
}

export function sshPickPrivateKey(): Promise<string | null> {
  return invoke('ssh_pick_private_key');
}
