export type Platform = 'macos' | 'windows' | 'linux';

export interface ParsedAccelerator {
  cmd: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  key: string;
}

const MODIFIER_NAMES = new Set(['cmd', 'cmdorctrl', 'ctrl', 'alt', 'option', 'shift']);

/** Parse a Tauri-style accelerator such as `CmdOrCtrl+Shift+N`. Throws on invalid input. */
export function parseAccelerator(acc: string): ParsedAccelerator {
  const tokens = acc.split('+');
  const key = tokens[tokens.length - 1] ?? '';
  if (key === '') throw new Error(`Invalid accelerator "${acc}": empty key`);
  if (MODIFIER_NAMES.has(key.toLowerCase())) {
    throw new Error(`Invalid accelerator "${acc}": missing key`);
  }
  const parsed: ParsedAccelerator = {
    cmd: false,
    shift: false,
    alt: false,
    ctrl: false,
    key: key.toUpperCase(),
  };
  for (const token of tokens.slice(0, -1)) {
    switch (token.toLowerCase()) {
      case 'cmd':
      case 'cmdorctrl':
        parsed.cmd = true;
        break;
      case 'ctrl':
        parsed.ctrl = true;
        break;
      case 'alt':
      case 'option':
        parsed.alt = true;
        break;
      case 'shift':
        parsed.shift = true;
        break;
      default:
        throw new Error(`Invalid accelerator "${acc}": unknown modifier "${token}"`);
    }
  }
  return parsed;
}

/** Canonical form `Ctrl+CmdOrCtrl+Alt+Shift+KEY`, used for equality checks. */
export function normalizeAccelerator(acc: string): string {
  const p = parseAccelerator(acc);
  const parts: string[] = [];
  if (p.ctrl) parts.push('Ctrl');
  if (p.cmd) parts.push('CmdOrCtrl');
  if (p.alt) parts.push('Alt');
  if (p.shift) parts.push('Shift');
  parts.push(p.key);
  return parts.join('+');
}

const MAC_KEY_GLYPHS: Record<string, string> = {
  ENTER: '↵',
  BACKSPACE: '⌫',
};

/** Human-readable label: `⇧⌘N` on macOS, `Ctrl+Shift+N` elsewhere. */
export function formatAccelerator(acc: string, platform: Platform): string {
  const p = parseAccelerator(acc);
  if (platform === 'macos') {
    return (
      (p.ctrl ? '⌃' : '') +
      (p.alt ? '⌥' : '') +
      (p.shift ? '⇧' : '') +
      (p.cmd ? '⌘' : '') +
      (MAC_KEY_GLYPHS[p.key] ?? p.key)
    );
  }
  const parts: string[] = [];
  if (p.ctrl || p.cmd) parts.push('Ctrl');
  if (p.alt) parts.push('Alt');
  if (p.shift) parts.push('Shift');
  parts.push(p.key);
  return parts.join('+');
}

/** Validate and return the accelerator string to hand to Tauri's `MenuItem.new`. */
export function toTauriAccelerator(acc: string): string {
  parseAccelerator(acc);
  return acc;
}
