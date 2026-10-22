import type { Platform } from './commands/accelerator';

export function secretStoreName(platform: Platform): string {
  return platform === 'windows' ? 'Windows Credential Manager' : 'system keychain';
}

export function secretStoreLongName(platform: Platform): string {
  return platform === 'windows' ? secretStoreName(platform) : 'operating system keychain';
}
