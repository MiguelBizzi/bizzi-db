import type { Platform } from './commands/accelerator';

export function secretStoreName(platform: Platform): string {
  if (platform === 'windows') return 'Windows Credential Manager';
  return platform === 'linux' ? 'system keyring' : 'system keychain';
}

export function secretStoreLongName(platform: Platform): string {
  if (platform === 'windows') return secretStoreName(platform);
  return platform === 'linux'
    ? 'Secret Service keyring (GNOME Keyring or KWallet)'
    : 'operating system keychain';
}
