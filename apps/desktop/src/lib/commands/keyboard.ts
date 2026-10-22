import { normalizeAccelerator, type Platform } from './accelerator';
import { acceleratorFor, COMMANDS, type Command } from './registry';

export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

const BARE_MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);

const PUNCTUATION_BY_CODE: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
};

function baseKey(e: KeyEventLike): string | null {
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) {
    return /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : letter[1]!;
  }
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit) return digit[1]!;
  const punct = PUNCTUATION_BY_CODE[e.code];
  if (punct) return punct;
  if (e.code === 'NumpadEnter') return 'Enter';
  if (e.key === ' ') return 'Space';
  return e.key === '' ? null : e.key;
}

/** `null` = the event cannot be a shortcut. */
export function acceleratorFromEvent(e: KeyEventLike, platform: Platform): string | null {
  if (BARE_MODIFIERS.has(e.key)) return null;
  const mac = platform === 'macos';
  if (!mac && e.metaKey) return null;
  const key = baseKey(e);
  if (key === null) return null;
  // AltGr is reported as Ctrl+Alt on Windows; a typed character that differs from the physical key is text input.
  if (e.ctrlKey && e.altKey && e.key.length === 1 && e.key !== ' ' && e.key !== key && e.key !== key.toLowerCase()) return null;
  const parts: string[] = [];
  if (mac) {
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('CmdOrCtrl');
  } else if (e.ctrlKey) {
    parts.push('CmdOrCtrl');
  }
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return normalizeAccelerator(parts.join('+'));
}

export function commandForAccelerator(
  acc: string,
  platform: Platform,
  commands: readonly Command[] = COMMANDS,
): Command | undefined {
  return commands.find((cmd) => {
    const own = acceleratorFor(cmd, platform);
    return own !== undefined && normalizeAccelerator(own) === acc;
  });
}

/** Browser shortcuts the webview would otherwise act on (reload, print, find, zoom, history). */
export const SUPPRESSED_BROWSER_KEYS: ReadonlySet<string> = new Set(
  [
    'F3',
    'F5',
    'CmdOrCtrl+F5',
    'CmdOrCtrl+R',
    'CmdOrCtrl+Shift+R',
    'CmdOrCtrl+P',
    'CmdOrCtrl+F',
    'CmdOrCtrl+G',
    'CmdOrCtrl+Shift+G',
    'CmdOrCtrl+U',
    'CmdOrCtrl+J',
    'CmdOrCtrl+=',
    'CmdOrCtrl+-',
    'CmdOrCtrl+0',
    'Alt+ArrowLeft',
    'Alt+ArrowRight',
  ].map(normalizeAccelerator),
);

/** The caller must `preventDefault()` unless the result is `'pass'`. */
export function decideKeydown(
  e: KeyEventLike,
  platform: Platform,
  run: (commandId: string) => boolean,
): 'ran' | 'suppressed' | 'pass' {
  if (e.defaultPrevented || e.isComposing) return 'pass';
  const acc = acceleratorFromEvent(e, platform);
  if (acc === null) return 'pass';
  const cmd = commandForAccelerator(acc, platform);
  if (cmd && run(cmd.id)) return 'ran';
  return SUPPRESSED_BROWSER_KEYS.has(acc) ? 'suppressed' : 'pass';
}

/** Mouse back (3) and forward (4) buttons trigger webview history navigation. */
export function isNavigationMouseButton(button: number): boolean {
  return button === 3 || button === 4;
}
