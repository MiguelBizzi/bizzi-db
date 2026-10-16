import { basicSetup, type BasicSetupOptions } from '@uiw/react-codemirror';
import { startCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { keymap, type KeyBinding } from '@codemirror/view';
import { parseAccelerator, type Platform } from './commands/accelerator';
import { COMMANDS, type Command } from './commands/registry';
import { currentPlatform } from './commands/shortcutLabel';
import type { RunMode } from './runTarget';

/*
 * In the main webview the page sees Cmd+key events before the native menu; the menu only gets
 * keys the page leaves unhandled. A CodeMirror binding on a menu key therefore pre-empts the
 * menu item, so the SQL editor drops basicSetup bindings whose key is a menu accelerator.
 */

/**
 * Menu commands whose keys the editor may keep, because the overlap is harmless:
 * - Run / Run All: the editor's own bindings run the same path as the menu (`editorShortcuts`).
 * - Toggle Comment: the editor's `Mod-/` does what the menu item does.
 * - Find in Table, Insert Row, Delete Selected Rows: grid-only and `typingConflict`, so they
 *   are disabled while the editor has focus; the editor keeps search, select-parent and
 *   delete-to-line-start.
 */
export const MENU_KEY_OVERLAP_ALLOWLIST: readonly string[] = [
  'query.run',
  'query.runAll',
  'edit.toggleComment',
  'edit.find',
  'edit.insertRow',
  'edit.deleteRows',
];

/** basicSetup with every keymap off; the SQL editor adds them back via `BASIC_SETUP_KEYMAP`. */
export const BASIC_SETUP_WITHOUT_KEYMAPS: BasicSetupOptions = {
  closeBracketsKeymap: false,
  defaultKeymap: false,
  searchKeymap: false,
  historyKeymap: false,
  foldKeymap: false,
  completionKeymap: false,
  lintKeymap: false,
};

/**
 * The bindings basicSetup installs, in its own order (closeBrackets, default, search, history,
 * fold, completion, lint). Read from basicSetup itself because `@codemirror/search` is not a
 * direct dependency of the app.
 */
export const BASIC_SETUP_KEYMAP: readonly KeyBinding[] = EditorState.create({
  extensions: basicSetup({
    lineNumbers: false,
    highlightActiveLineGutter: false,
    highlightSpecialChars: false,
    history: false,
    foldGutter: false,
    drawSelection: false,
    dropCursor: false,
    allowMultipleSelections: false,
    indentOnInput: false,
    syntaxHighlighting: false,
    bracketMatching: false,
    closeBrackets: false,
    autocompletion: false,
    rectangularSelection: false,
    crosshairCursor: false,
    highlightActiveLine: false,
    highlightSelectionMatches: false,
  }),
})
  .facet(keymap)
  .flat();

const NAMED_KEYS: Record<string, string> = { enter: 'Enter', backspace: 'Backspace', delete: 'Delete', space: 'Space' };

/** A registry accelerator in CodeMirror's key-name form: `CmdOrCtrl+Alt+\` → `Mod-Alt-\`. */
export function acceleratorToCodeMirrorKey(acc: string): string {
  const p = parseAccelerator(acc);
  const raw = acc.split('+').pop() ?? '';
  const key = raw.length === 1 ? raw.toLowerCase() : (NAMED_KEYS[raw.toLowerCase()] ?? raw);
  return (p.ctrl ? 'Ctrl-' : '') + (p.cmd ? 'Mod-' : '') + (p.alt ? 'Alt-' : '') + (p.shift ? 'Shift-' : '') + key;
}

/** Platform-independent form of a CodeMirror key name (first stroke only), for comparisons. */
function canonicalKey(name: string, platform: Platform): string {
  const parts = name.split(' ')[0].split(/-(?!$)/);
  let key = parts.pop() ?? '';
  let alt = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  for (const mod of parts) {
    if (/^(cmd|meta|m)$/i.test(mod)) meta = true;
    else if (/^a(lt)?$/i.test(mod)) alt = true;
    else if (/^(c|ctrl|control)$/i.test(mod)) ctrl = true;
    else if (/^s(hift)?$/i.test(mod)) shift = true;
    else if (/^mod$/i.test(mod)) {
      if (platform === 'macos') meta = true;
      else ctrl = true;
    }
  }
  if (key === 'Space') key = ' ';
  // An upper-case letter binds the shifted key (`Alt-A` is Alt+Shift+A).
  if (/^[A-Z]$/.test(key)) shift = true;
  if (key.length === 1) key = key.toLowerCase();
  return (alt ? 'Alt-' : '') + (ctrl ? 'Ctrl-' : '') + (meta ? 'Meta-' : '') + (shift ? 'Shift-' : '') + key;
}

const CM_PLATFORM: Record<Platform, 'mac' | 'win' | 'linux'> = { macos: 'mac', windows: 'win', linux: 'linux' };

/** Canonical keys a binding takes on `platform`, including its `shift` variant. */
function boundKeys(binding: KeyBinding, platform: Platform): string[] {
  // Mirrors CodeMirror's own lookup: the platform-specific name, else `key`.
  const name = binding[CM_PLATFORM[platform]] || binding.key;
  if (!name) return [];
  const keys = [canonicalKey(name, platform)];
  if (binding.shift) keys.push(canonicalKey('Shift-' + name, platform));
  return keys;
}

function menuKeys(platform: Platform, commands: readonly Command[], allow: readonly string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const cmd of commands) {
    if (!cmd.accelerator || allow.includes(cmd.id)) continue;
    keys.set(canonicalKey(acceleratorToCodeMirrorKey(cmd.accelerator), platform), cmd.id);
  }
  return keys;
}

/** Bindings that take a menu accelerator's key on `platform` (allowlisted commands excepted). */
export function menuKeyCollisions(
  bindings: readonly KeyBinding[],
  platform: Platform,
  allow: readonly string[] = MENU_KEY_OVERLAP_ALLOWLIST,
  commands: readonly Command[] = COMMANDS,
): Array<{ key: string; commandId: string }> {
  const menu = menuKeys(platform, commands, allow);
  const collisions: Array<{ key: string; commandId: string }> = [];
  for (const binding of bindings) {
    for (const key of boundKeys(binding, platform)) {
      const commandId = menu.get(key);
      if (commandId) collisions.push({ key, commandId });
    }
  }
  return collisions;
}

/** `bindings` minus those that would take a (non-allowlisted) menu accelerator's key. */
export function withoutMenuKeys(bindings: readonly KeyBinding[], platform: Platform): KeyBinding[] {
  const menu = menuKeys(platform, COMMANDS, MENU_KEY_OVERLAP_ALLOWLIST);
  return bindings.filter((binding) => !boundKeys(binding, platform).some((key) => menu.has(key)));
}

/** basicSetup's keymaps for this platform, minus bindings that would shadow menu shortcuts. */
export const EDITOR_KEYMAP: readonly KeyBinding[] = withoutMenuKeys(BASIC_SETUP_KEYMAP, currentPlatform());

/**
 * The SQL editor's own highest-precedence bindings. `onRun` returns whether it ran.
 *
 * Mod-Enter / Mod-Shift-Enter must be handled here: the page sees the key before the native
 * menu, and defaultKeymap binds Mod-Enter to insertBlankLine. Handling (and so preventDefault-ing)
 * the key means the menu's Run item does not also fire; if the menu ever gets the key first, the
 * editor never sees it. Either way the query runs once, through the same path as the menu.
 */
export function editorShortcuts(onRun: (mode: RunMode) => boolean): KeyBinding[] {
  return [
    { key: 'Ctrl-Space', run: startCompletion },
    { key: 'Mod-Enter', run: () => onRun('auto') },
    { key: 'Mod-Shift-Enter', run: () => onRun('all') },
  ];
}
