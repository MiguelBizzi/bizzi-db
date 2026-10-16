import { describe, expect, test } from 'bun:test';
import { normalizeAccelerator, parseAccelerator } from './accelerator';
import { EMPTY_CONTEXT, type CommandContext } from './context';
import { RESERVED_ACCELERATORS } from './reserved';
import { COMMANDS, commandById, isCommandEnabled, menuState, type Command } from './registry';
import { currentPlatform, shortcutLabel } from './shortcutLabel';

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({ ...EMPTY_CONTEXT, ...over });

const withAccelerator = COMMANDS.filter((c) => c.accelerator !== undefined);

describe('COMMANDS registry invariants', () => {
  test('every id is unique', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every accelerator parses', () => {
    for (const c of withAccelerator) {
      expect(() => parseAccelerator(c.accelerator as string)).not.toThrow();
    }
  });

  test('every accelerator is unique after normalization', () => {
    const normalized = withAccelerator.map((c) => normalizeAccelerator(c.accelerator as string));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  test('no accelerator is reserved', () => {
    const reserved = new Set(RESERVED_ACCELERATORS.map(normalizeAccelerator));
    for (const c of withAccelerator) {
      expect(reserved.has(normalizeAccelerator(c.accelerator as string))).toBe(false);
    }
  });

  test('registers the Phase 1 command ids', () => {
    expect(COMMANDS.map((c) => c.id).sort()).toEqual(
      [
        'app.settings',
        'app.checkUpdates',
        'file.newQuery',
        'file.closeWindow',
        'query.review',
        'conn.refreshTable',
        'view.palette',
        'view.erd',
        'view.metrics',
        'view.activity',
      ].sort(),
    );
  });
});

describe('commandById', () => {
  test('returns the command', () => {
    expect(commandById('file.newQuery').label).toBe('New Query Tab');
  });

  test('throws for an unknown id', () => {
    expect(() => commandById('nope.nothing')).toThrow();
  });
});

describe('isCommandEnabled', () => {
  const rows: Array<[string, Partial<CommandContext>, boolean]> = [
    ['conn.refreshTable', { activeTabType: 'table_data' }, true],
    ['conn.refreshTable', { activeTabType: 'sql_editor' }, false],
    ['conn.refreshTable', {}, false],
    ['file.newQuery', { connectionOpen: true }, true],
    ['file.newQuery', {}, false],
    ['view.erd', { connectionOpen: true }, true],
    ['view.erd', {}, false],
    ['view.palette', { connectionOpen: true }, true],
    ['app.settings', {}, true],
    ['app.checkUpdates', {}, true],
    ['file.closeWindow', {}, true],
    // modal gating
    ['view.erd', { connectionOpen: true, modalOpen: true }, false],
    ['app.settings', { modalOpen: true }, true],
    ['file.closeWindow', { modalOpen: true }, true],
    ['view.palette', { connectionOpen: true, modalOpen: true }, true],
    ['app.checkUpdates', { modalOpen: true }, false],
  ];
  for (const [id, over, expected] of rows) {
    test(`${id} with ${JSON.stringify(over)} -> ${expected}`, () => {
      expect(isCommandEnabled(commandById(id), ctx(over))).toBe(expected);
    });
  }

  test('typingConflict command is disabled while a text input is focused', () => {
    const cmd: Command = {
      id: 'test.typing',
      label: 'Typing',
      enabled: () => true,
      typingConflict: true,
    };
    expect(isCommandEnabled(cmd, ctx())).toBe(true);
    expect(isCommandEnabled(cmd, ctx({ textInputFocused: true }))).toBe(false);
  });

  test('a command without typingConflict stays enabled while typing', () => {
    const cmd: Command = { id: 'test.plain', label: 'Plain', enabled: () => true };
    expect(isCommandEnabled(cmd, ctx({ textInputFocused: true }))).toBe(true);
  });

  test('allowInModal command still respects its own enabled predicate', () => {
    const cmd: Command = {
      id: 'test.modal',
      label: 'Modal',
      enabled: (c) => c.connectionOpen,
      allowInModal: true,
    };
    expect(isCommandEnabled(cmd, ctx({ modalOpen: true }))).toBe(false);
    expect(isCommandEnabled(cmd, ctx({ modalOpen: true, connectionOpen: true }))).toBe(true);
  });
});

describe('menuState', () => {
  test('covers every command in enabled and labels', () => {
    const state = menuState(ctx());
    for (const c of COMMANDS) {
      expect(typeof state.enabled[c.id]).toBe('boolean');
      expect(state.labels[c.id]).toBe(c.label);
    }
  });

  test('enabled map reflects the context', () => {
    const state = menuState(ctx({ connectionOpen: true, activeTabType: 'table_data' }));
    expect(state.enabled['conn.refreshTable']).toBe(true);
    expect(state.enabled['view.erd']).toBe(true);
    expect(menuState(ctx()).enabled['view.erd']).toBe(false);
  });

  test('dynamicLabel overrides the static label', () => {
    const cmds: Command[] = [
      {
        id: 'test.run',
        label: 'Run Statement',
        dynamicLabel: (c) => (c.sqlSelectionPresent ? 'Run Selection' : 'Run Statement'),
        enabled: () => true,
      },
      { id: 'test.static', label: 'Static', enabled: () => true },
    ];
    expect(menuState(ctx({ sqlSelectionPresent: true }), cmds).labels).toEqual({
      'test.run': 'Run Selection',
      'test.static': 'Static',
    });
    expect(menuState(ctx(), cmds).labels['test.run']).toBe('Run Statement');
  });

  test('typingConflict commands are disabled in menuState while typing', () => {
    const cmds: Command[] = [
      { id: 'test.typing', label: 'T', enabled: () => true, typingConflict: true },
    ];
    expect(menuState(ctx(), cmds).enabled['test.typing']).toBe(true);
    expect(menuState(ctx({ textInputFocused: true }), cmds).enabled['test.typing']).toBe(false);
  });
});

describe('shortcutLabel', () => {
  test('formats the accelerator for macOS', () => {
    expect(shortcutLabel('file.newQuery', 'macos')).toBe('⌘T');
    expect(shortcutLabel('view.erd', 'macos')).toBe('⇧⌘E');
  });

  test('formats the accelerator for other platforms', () => {
    expect(shortcutLabel('file.newQuery', 'windows')).toBe('Ctrl+T');
    expect(shortcutLabel('view.erd', 'linux')).toBe('Ctrl+Shift+E');
  });

  test('is empty when the command has no accelerator', () => {
    expect(shortcutLabel('app.checkUpdates', 'macos')).toBe('');
  });

  test('defaults to the current platform', () => {
    expect(shortcutLabel('file.newQuery')).toBe(shortcutLabel('file.newQuery', currentPlatform()));
  });
});

describe('currentPlatform', () => {
  test('detects the platform from navigator.userAgent, defaulting to macos without a browser', () => {
    const g = globalThis as { navigator?: unknown };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const setUa = (userAgent: string) =>
      Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true, writable: true });
    try {
      setUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      expect(currentPlatform()).toBe('macos');
      setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      expect(currentPlatform()).toBe('windows');
      setUa('Mozilla/5.0 (X11; Linux x86_64)');
      expect(currentPlatform()).toBe('linux');
      setUa('Bun/1.3.11');
      expect(currentPlatform()).toBe('macos');
      delete g.navigator;
      expect(currentPlatform()).toBe('macos');
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else delete g.navigator;
    }
  });
});
