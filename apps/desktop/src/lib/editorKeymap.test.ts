import { describe, expect, test } from 'bun:test';
import { closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import type { KeyBinding } from '@codemirror/view';
import type { Platform } from './commands/accelerator';
import {
  BASIC_SETUP_KEYMAP,
  MENU_KEY_OVERLAP_ALLOWLIST,
  acceleratorToCodeMirrorKey,
  editorShortcuts,
  menuKeyCollisions,
  withoutMenuKeys,
} from './editorKeymap';

const PLATFORMS: Platform[] = ['macos', 'windows', 'linux'];

describe('acceleratorToCodeMirrorKey', () => {
  test('maps registry accelerators to CodeMirror key names', () => {
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+Alt+\\')).toBe('Mod-Alt-\\');
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+Shift+M')).toBe('Mod-Shift-m');
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+Enter')).toBe('Mod-Enter');
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+Backspace')).toBe('Mod-Backspace');
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+Shift+]')).toBe('Mod-Shift-]');
    expect(acceleratorToCodeMirrorKey('CmdOrCtrl+,')).toBe('Mod-,');
  });
});

describe('BASIC_SETUP_KEYMAP', () => {
  test("holds basicSetup's keymaps in their original order", () => {
    const keys = BASIC_SETUP_KEYMAP;
    const indexOf = (binding: KeyBinding) => keys.indexOf(binding);
    const groups = [closeBracketsKeymap, defaultKeymap, historyKeymap, foldKeymap, completionKeymap, lintKeymap];
    for (const group of groups) for (const binding of group) expect(indexOf(binding)).toBeGreaterThanOrEqual(0);
    // closeBrackets, default, search, history, fold, completion, lint
    expect(indexOf(closeBracketsKeymap[0])).toBeLessThan(indexOf(defaultKeymap[0]));
    expect(indexOf(defaultKeymap.at(-1)!)).toBeLessThan(indexOf(historyKeymap[0]));
    expect(indexOf(foldKeymap.at(-1)!)).toBeLessThan(indexOf(completionKeymap[0]));
    expect(indexOf(completionKeymap.at(-1)!)).toBeLessThan(indexOf(lintKeymap[0]));
    // searchKeymap (from @codemirror/search, not a direct dependency) sits between default and history.
    const selectMatches = keys.findIndex((b) => b.key === 'Mod-Shift-l');
    expect(selectMatches).toBeGreaterThan(indexOf(defaultKeymap.at(-1)!));
    expect(selectMatches).toBeLessThan(indexOf(historyKeymap[0]));
  });

  test('the unfiltered keymaps shadow menu shortcuts (why the editor filters them)', () => {
    const keys = menuKeyCollisions(BASIC_SETUP_KEYMAP, 'macos').map((c) => c.commandId);
    expect(keys).toContain('view.splitRight'); // defaultKeymap Mod-Alt-\ indentSelection
    expect(keys).toContain('view.metrics'); // lintKeymap Mod-Shift-m openLintPanel
    expect(keys).toContain('view.activity'); // searchKeymap Mod-Shift-l selectSelectionMatches
  });
});

describe('editor keymaps vs menu accelerators', () => {
  for (const platform of PLATFORMS) {
    test(`no SQL editor binding takes a menu key on ${platform}, except the allowlist`, () => {
      const bound = [
        ...editorShortcuts(() => true),
        indentWithTab,
        ...withoutMenuKeys(BASIC_SETUP_KEYMAP, platform),
      ];
      expect(menuKeyCollisions(bound, platform)).toEqual([]);
    });
  }

  test('the allowlist is exactly the intended harmless overlaps', () => {
    expect([...MENU_KEY_OVERLAP_ALLOWLIST].sort()).toEqual(
      ['edit.deleteRows', 'edit.find', 'edit.insertRow', 'edit.toggleComment', 'query.run', 'query.runAll'].sort(),
    );
  });

  test('on macOS only the three colliding bindings are dropped', () => {
    const kept = withoutMenuKeys(BASIC_SETUP_KEYMAP, 'macos');
    const dropped = BASIC_SETUP_KEYMAP.filter((b) => !kept.includes(b)).map((b) => b.mac ?? b.key);
    expect(dropped.sort()).toEqual(['Mod-Alt-\\', 'Mod-Shift-l', 'Mod-Shift-m'].sort());
  });

  test('ordinary editing keys survive the filter', () => {
    const kept = withoutMenuKeys(BASIC_SETUP_KEYMAP, 'macos').map((b) => b.key);
    for (const key of ['Mod-z', 'Mod-f', 'Mod-/', 'Mod-[', 'Mod-]', 'Enter', 'Backspace', 'Escape', 'Mod-d']) {
      expect(kept).toContain(key);
    }
  });
});

describe('editorShortcuts', () => {
  test('Mod-Enter runs auto, Mod-Shift-Enter runs all, both consume the key', () => {
    const modes: string[] = [];
    const bindings = editorShortcuts((mode) => {
      modes.push(mode);
      return true;
    });
    const view = {} as Parameters<NonNullable<KeyBinding['run']>>[0];
    const run = (key: string) => bindings.find((b) => b.key === key)?.run?.(view);
    expect(run('Mod-Enter')).toBe(true);
    expect(run('Mod-Shift-Enter')).toBe(true);
    expect(modes).toEqual(['auto', 'all']);
  });

  test('without a run handler the keys fall through', () => {
    const bindings = editorShortcuts(() => false);
    const view = {} as Parameters<NonNullable<KeyBinding['run']>>[0];
    expect(bindings.find((b) => b.key === 'Mod-Enter')?.run?.(view)).toBe(false);
  });
});
