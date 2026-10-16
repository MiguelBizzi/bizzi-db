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
        'query.run',
        'query.runAll',
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
    ['view.palette', { connectionOpen: false }, true],
    ['app.settings', {}, true],
    ['app.checkUpdates', {}, true],
    ['file.closeWindow', {}, true],
    ['query.run', { activeTabType: 'sql_editor' }, true],
    ['query.run', { activeTabType: 'table_data' }, false],
    ['query.run', {}, false],
    ['query.run', { activeTabType: 'sql_editor', modalOpen: true }, false],
    ['query.runAll', { activeTabType: 'sql_editor' }, true],
    ['query.runAll', { activeTabType: 'table_data' }, false],
    ['query.runAll', {}, false],
    ['query.runAll', { activeTabType: 'sql_editor', modalOpen: true }, false],
    // modal gating
    ['view.erd', { connectionOpen: true, modalOpen: true }, false],
    ['app.settings', { modalOpen: true }, true],
    ['file.closeWindow', { modalOpen: true }, true],
    ['view.palette', { connectionOpen: true, modalOpen: true }, true],
    ['view.palette', { modalOpen: true }, true],
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
      expect(state.labels[c.id]).toBe(c.dynamicLabel ? c.dynamicLabel(EMPTY_CONTEXT) : c.label);
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

  test('query.run is labelled Run Selection only while the editor has a selection', () => {
    expect(menuState(ctx({ sqlSelectionPresent: true })).labels['query.run']).toBe('Run Selection');
    expect(menuState(ctx({ sqlSelectionPresent: false })).labels['query.run']).toBe('Run Statement');
    expect(menuState(ctx()).labels['query.runAll']).toBe('Run All');
  });

  test('run commands act inside the editor, so typing does not disable them', () => {
    const state = menuState(ctx({ activeTabType: 'sql_editor', textInputFocused: true }));
    expect(state.enabled['query.run']).toBe(true);
    expect(state.enabled['query.runAll']).toBe(true);
  });

  test('typingConflict commands are disabled in menuState while typing', () => {
    const cmds: Command[] = [
      { id: 'test.typing', label: 'T', enabled: () => true, typingConflict: true },
    ];
    expect(menuState(ctx(), cmds).enabled['test.typing']).toBe(true);
    expect(menuState(ctx({ textInputFocused: true }), cmds).enabled['test.typing']).toBe(false);
  });
});

describe('menuState for realistic app contexts', () => {
  const sqlTabOpen = ctx({
    activeTabType: 'sql_editor',
    connectionOpen: true,
    tabCount: 1,
    pendingCount: 0,
    modalOpen: false,
  });
  const enabledIds = (c: CommandContext) =>
    Object.entries(menuState(c).enabled)
      .filter(([, on]) => on)
      .map(([id]) => id)
      .sort();

  test('SQL tab, connection open, nothing pending, no modal', () => {
    expect(enabledIds(sqlTabOpen)).toEqual(
      [
        'app.settings',
        'app.checkUpdates',
        'file.newQuery',
        'file.closeWindow',
        'query.run',
        'query.runAll',
        'query.review',
        'view.palette',
        'view.erd',
        'view.metrics',
        'view.activity',
      ].sort(),
    );
    expect(menuState(sqlTabOpen).enabled['conn.refreshTable']).toBe(false);
  });

  test('a table_data tab enables Refresh Table', () => {
    expect(menuState({ ...sqlTabOpen, activeTabType: 'table_data' }).enabled['conn.refreshTable']).toBe(true);
  });

  test('an open modal leaves only the allowInModal commands enabled', () => {
    expect(enabledIds({ ...sqlTabOpen, activeTabType: 'table_data', modalOpen: true })).toEqual(
      ['app.settings', 'file.closeWindow', 'view.palette'].sort(),
    );
  });

  test('no connection leaves only the connection-independent commands enabled', () => {
    expect(enabledIds(ctx())).toEqual(
      ['app.settings', 'app.checkUpdates', 'file.closeWindow', 'view.palette'].sort(),
    );
  });

  test('the command palette stays available on the connection picker (no connection)', () => {
    const state = menuState(ctx({ connectionOpen: false }));
    expect(state.enabled['view.palette']).toBe(true);
    for (const id of ['view.erd', 'view.metrics', 'view.activity', 'file.newQuery', 'query.review']) {
      expect(state.enabled[id]).toBe(false);
    }
  });
});

describe('shortcutLabel', () => {
  test('formats the accelerator for macOS', () => {
    expect(shortcutLabel('file.newQuery', 'macos')).toBe('⌘T');
    expect(shortcutLabel('view.erd', 'macos')).toBe('⇧⌘E');
  });

  test('formats the run accelerators', () => {
    expect(shortcutLabel('query.run', 'macos')).toBe('⌘↵');
    expect(shortcutLabel('query.runAll', 'macos')).toBe('⇧⌘↵');
    expect(shortcutLabel('query.run', 'windows')).toBe('Ctrl+Enter');
    expect(shortcutLabel('query.runAll', 'linux')).toBe('Ctrl+Shift+Enter');
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
