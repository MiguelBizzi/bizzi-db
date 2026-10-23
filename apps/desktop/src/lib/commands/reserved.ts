import type { Platform } from './accelerator';

/** Accelerators owned by the OS or the standard macOS menus; commands must not claim them. */
export const RESERVED_ACCELERATORS: readonly string[] = [
  'CmdOrCtrl+Q',
  'CmdOrCtrl+H',
  'CmdOrCtrl+Alt+H',
  'CmdOrCtrl+M',
  'CmdOrCtrl+Alt+M',
  'CmdOrCtrl+`',
  'Ctrl+CmdOrCtrl+F',
  'CmdOrCtrl+Z',
  'CmdOrCtrl+Shift+Z',
  'CmdOrCtrl+X',
  'CmdOrCtrl+C',
  'CmdOrCtrl+V',
  'CmdOrCtrl+A',
];

export const WINDOWS_RESERVED_ACCELERATORS: readonly string[] = [
  'CmdOrCtrl+Z',
  'CmdOrCtrl+Y',
  'CmdOrCtrl+X',
  'CmdOrCtrl+C',
  'CmdOrCtrl+V',
  'CmdOrCtrl+A',
  'Alt+F4',
  'Alt+Space',
  'F10',
  'F12',
  'CmdOrCtrl+Escape',
];

export const LINUX_RESERVED_ACCELERATORS: readonly string[] = [
  'CmdOrCtrl+Z',
  'CmdOrCtrl+Shift+Z',
  'CmdOrCtrl+Y',
  'CmdOrCtrl+X',
  'CmdOrCtrl+C',
  'CmdOrCtrl+V',
  'CmdOrCtrl+A',
  'Alt+F4',
  'Alt+Space',
  'Alt+Tab',
  'F10',
  'F12',
  'CmdOrCtrl+Escape',
  'CmdOrCtrl+Alt+T',
  'CmdOrCtrl+Alt+L',
  'CmdOrCtrl+Alt+D',
  'CmdOrCtrl+Alt+Delete',
  'CmdOrCtrl+Alt+Escape',
  'CmdOrCtrl+Alt+ArrowLeft',
  'CmdOrCtrl+Alt+ArrowRight',
  'CmdOrCtrl+Alt+ArrowUp',
  'CmdOrCtrl+Alt+ArrowDown',
  ...Array.from({ length: 12 }, (_, i) => `CmdOrCtrl+F${i + 1}`),
];

export function reservedAccelerators(platform: Platform): readonly string[] {
  if (platform === 'macos') return RESERVED_ACCELERATORS;
  return platform === 'linux' ? LINUX_RESERVED_ACCELERATORS : WINDOWS_RESERVED_ACCELERATORS;
}
