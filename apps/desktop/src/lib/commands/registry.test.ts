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

  test('registers the Phase 1 to Phase 4 command ids', () => {
    expect(COMMANDS.map((c) => c.id).sort()).toEqual(
      [
        'app.settings',
        'app.checkUpdates',
        'file.newQuery',
        'file.saveQuery',
        'file.export',
        'edit.formatSql',
        'edit.toggleComment',
        'edit.find',
        'edit.insertRow',
        'edit.deleteRows',
        'file.closeTab',
        'file.closeOthers',
        'file.closeRight',
        'file.reopenTab',
        'file.closeWindow',
        'query.run',
        'query.runAll',
        'query.review',
        'query.commit',
        'query.discard',
        'conn.refreshTable',
        'file.newConnection',
        'file.newTable',
        'file.newView',
        'file.newFunction',
        'file.newIndex',
        'conn.switch',
        'conn.back',
        'conn.edit',
        'conn.reconnect',
        'conn.disconnect',
        'conn.refreshSchema',
        'view.palette',
        'view.toggleSidebar',
        'view.erd',
        'view.metrics',
        'view.activity',
        'view.nextTab',
        'view.prevTab',
        'view.tab.1',
        'view.tab.2',
        'view.tab.3',
        'view.tab.4',
        'view.tab.5',
        'view.tab.6',
        'view.tab.7',
        'view.tab.8',
        'view.tab.9',
        'view.splitRight',
        'view.splitDown',
        'help.docs',
        'help.releaseNotes',
        'help.reportIssue',
        'help.shortcuts',
      ].sort(),
    );
  });

  test('tab and pane commands have the expected labels and accelerators', () => {
    const spec: Array<[string, string, string | undefined]> = [
      ['file.closeTab', 'Close Tab', 'CmdOrCtrl+W'],
      ['file.closeOthers', 'Close Other Tabs', 'CmdOrCtrl+Alt+W'],
      ['file.closeRight', 'Close Tabs to the Right', undefined],
      ['file.reopenTab', 'Reopen Closed Tab', 'CmdOrCtrl+Shift+T'],
      ['view.nextTab', 'Next Tab', 'CmdOrCtrl+Shift+]'],
      ['view.prevTab', 'Previous Tab', 'CmdOrCtrl+Shift+['],
      ['view.splitRight', 'Split Pane Right', 'CmdOrCtrl+Alt+\\'],
      ['view.splitDown', 'Split Pane Down', undefined],
      ['view.toggleSidebar', 'Toggle Sidebar', 'CmdOrCtrl+B'],
    ];
    for (let n = 1; n <= 8; n++) spec.push([`view.tab.${n}`, `Tab ${n}`, `CmdOrCtrl+${n}`]);
    spec.push(['view.tab.9', 'Last Tab', 'CmdOrCtrl+9']);
    for (const [id, label, accelerator] of spec) {
      const cmd = commandById(id);
      expect(cmd.label).toBe(label);
      expect(cmd.accelerator).toBe(accelerator);
      expect(cmd.allowInModal ?? false).toBe(false);
    }
  });

  test('grid and pending-change commands have the expected labels, accelerators and typing rules', () => {
    const spec: Array<[string, string, string | undefined, boolean]> = [
      ['edit.find', 'Find in Table…', 'CmdOrCtrl+F', true],
      ['edit.insertRow', 'Insert Row', 'CmdOrCtrl+I', true],
      ['edit.deleteRows', 'Delete Selected Rows', 'CmdOrCtrl+Backspace', true],
      ['file.export', 'Export Results…', 'CmdOrCtrl+E', false],
      ['query.commit', 'Commit Pending Changes', 'CmdOrCtrl+Shift+S', false],
      ['query.discard', 'Discard Pending Changes', undefined, false],
    ];
    for (const [id, label, accelerator, typingConflict] of spec) {
      const cmd = commandById(id);
      expect(cmd.label).toBe(label);
      expect(cmd.accelerator).toBe(accelerator);
      expect(cmd.typingConflict ?? false).toBe(typingConflict);
      expect(cmd.allowInModal ?? false).toBe(false);
    }
  });

  test('connection and schema commands have the expected labels, accelerators and rules', () => {
    const spec: Array<[string, string, string | undefined]> = [
      ['file.newConnection', 'New Connection…', 'CmdOrCtrl+N'],
      ['file.newTable', 'New Table…', 'CmdOrCtrl+Shift+N'],
      ['file.newView', 'New View…', 'CmdOrCtrl+Alt+V'],
      ['file.newFunction', 'New Function…', 'CmdOrCtrl+Alt+F'],
      ['file.newIndex', 'New Index…', 'CmdOrCtrl+Shift+I'],
      ['conn.switch', 'Switch Connection…', undefined],
      ['conn.back', 'Back to Connections', undefined],
      ['conn.edit', 'Edit Connection…', undefined],
      ['conn.reconnect', 'Reconnect', undefined],
      ['conn.disconnect', 'Disconnect', undefined],
      ['conn.refreshSchema', 'Refresh Schema', 'CmdOrCtrl+Shift+R'],
    ];
    for (const [id, label, accelerator] of spec) {
      const cmd = commandById(id);
      expect(cmd.label).toBe(label);
      expect(cmd.accelerator).toBe(accelerator);
      expect(cmd.allowInModal ?? false).toBe(false);
      expect(cmd.typingConflict ?? false).toBe(false);
    }
  });

  test('help commands have the expected labels, no accelerator and are not allowed in a modal', () => {
    const spec: Array<[string, string]> = [
      ['help.docs', 'Documentation'],
      ['help.releaseNotes', 'Release Notes'],
      ['help.reportIssue', 'Report an Issue'],
      ['help.shortcuts', 'Keyboard Shortcuts…'],
    ];
    for (const [id, label] of spec) {
      const cmd = commandById(id);
      expect(cmd.label).toBe(label);
      expect(cmd.accelerator).toBeUndefined();
      expect(cmd.allowInModal ?? false).toBe(false);
      expect(cmd.typingConflict ?? false).toBe(false);
    }
  });

  test('CmdOrCtrl+Backspace parses as Cmd/Ctrl + Backspace', () => {
    const parsed = parseAccelerator('CmdOrCtrl+Backspace');
    expect(parsed.cmd).toBe(true);
    expect(parsed.key).toBe('BACKSPACE');
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
    ['view.toggleSidebar', { connectionOpen: true }, true],
    ['view.toggleSidebar', {}, false],
    ['view.toggleSidebar', { connectionOpen: true, modalOpen: true }, false],
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
    // editor commands
    ['file.saveQuery', { activeTabType: 'sql_editor' }, true],
    ['file.saveQuery', { activeTabType: 'table_data' }, false],
    ['file.saveQuery', {}, false],
    ['file.saveQuery', { activeTabType: 'sql_editor', modalOpen: true }, false],
    ['edit.formatSql', { activeTabType: 'sql_editor' }, true],
    ['edit.formatSql', { activeTabType: 'table_data' }, false],
    ['edit.formatSql', {}, false],
    ['edit.formatSql', { activeTabType: 'sql_editor', modalOpen: true }, false],
    ['edit.toggleComment', { activeTabType: 'sql_editor' }, true],
    ['edit.toggleComment', { activeTabType: 'table_data' }, false],
    ['edit.toggleComment', {}, false],
    ['edit.toggleComment', { activeTabType: 'sql_editor', modalOpen: true }, false],
    // tab and pane commands (Phase 2)
    ['file.closeTab', { paneTabCount: 1 }, true],
    ['file.closeTab', { paneTabCount: 0 }, false],
    ['file.closeTab', { paneTabCount: 1, modalOpen: true }, false],
    ['file.closeOthers', { paneTabCount: 2 }, true],
    ['file.closeOthers', { paneTabCount: 1 }, false],
    ['file.closeRight', { paneTabCount: 2 }, true],
    ['file.closeRight', { paneTabCount: 1 }, false],
    ['file.reopenTab', { closedTabCount: 1 }, true],
    ['file.reopenTab', { closedTabCount: 0 }, false],
    ['file.reopenTab', { closedTabCount: 1, modalOpen: true }, false],
    ['view.nextTab', { paneTabCount: 2 }, true],
    ['view.nextTab', { paneTabCount: 1 }, false],
    ['view.prevTab', { paneTabCount: 2 }, true],
    ['view.prevTab', { paneTabCount: 1 }, false],
    ['view.tab.1', { paneTabCount: 1 }, true],
    ['view.tab.1', { paneTabCount: 0 }, false],
    ['view.tab.3', { paneTabCount: 3 }, true],
    ['view.tab.3', { paneTabCount: 2 }, false],
    ['view.tab.8', { paneTabCount: 8 }, true],
    ['view.tab.8', { paneTabCount: 7 }, false],
    ['view.tab.9', { paneTabCount: 1 }, true],
    ['view.tab.9', { paneTabCount: 0 }, false],
    ['view.tab.9', { paneTabCount: 1, modalOpen: true }, false],
    ['view.splitRight', { activeTabType: 'sql_editor' }, true],
    ['view.splitRight', {}, false],
    ['view.splitRight', { activeTabType: 'table_data', modalOpen: true }, false],
    ['view.splitDown', { activeTabType: 'table_data' }, true],
    ['view.splitDown', {}, false],
    // grid commands (Phase 3): typingConflict keeps them out of the way of text editing
    ['edit.find', { activeTabType: 'table_data' }, true],
    ['edit.find', { activeTabType: 'table_data', textInputFocused: true }, false],
    ['edit.find', { activeTabType: 'sql_editor' }, false],
    ['edit.find', {}, false],
    ['edit.insertRow', { activeTabType: 'table_data' }, true],
    ['edit.insertRow', { activeTabType: 'table_data', textInputFocused: true }, false],
    ['edit.insertRow', { activeTabType: 'sql_editor' }, false],
    ['edit.deleteRows', { activeTabType: 'table_data', selectedRowCount: 2 }, true],
    ['edit.deleteRows', { activeTabType: 'table_data', selectedRowCount: 0 }, false],
    ['edit.deleteRows', { activeTabType: 'table_data', selectedRowCount: 1, textInputFocused: true }, false],
    ['edit.deleteRows', { activeTabType: 'sql_editor', selectedRowCount: 1 }, false],
    ['file.export', { activeTabType: 'table_data' }, true],
    ['file.export', { activeTabType: 'table_data', textInputFocused: true }, true],
    ['file.export', { activeTabType: 'sql_editor', sqlResultPresent: true }, true],
    ['file.export', { activeTabType: 'sql_editor', sqlResultPresent: false }, false],
    ['file.export', { activeTabType: 'erd_schema', sqlResultPresent: true }, false],
    ['file.export', {}, false],
    // pending changes
    ['query.commit', { pendingCount: 3 }, true],
    ['query.commit', { pendingCount: 0 }, false],
    ['query.discard', { pendingCount: 1 }, true],
    ['query.discard', { pendingCount: 0 }, false],
    // an open modal disables every Phase 3 command
    ['edit.find', { activeTabType: 'table_data', modalOpen: true }, false],
    ['edit.insertRow', { activeTabType: 'table_data', modalOpen: true }, false],
    ['edit.deleteRows', { activeTabType: 'table_data', selectedRowCount: 1, modalOpen: true }, false],
    ['file.export', { activeTabType: 'table_data', modalOpen: true }, false],
    ['query.commit', { pendingCount: 1, modalOpen: true }, false],
    ['query.discard', { pendingCount: 1, modalOpen: true }, false],
    // connection and schema commands (Phase 4)
    ['file.newConnection', {}, true],
    ['file.newConnection', { connectionOpen: true }, true],
    ['file.newConnection', { modalOpen: true }, false],
    ['file.newTable', { connectionOpen: true }, true],
    ['file.newTable', {}, false],
    ['file.newFunction', { connectionOpen: true }, true],
    ['file.newFunction', { connectionOpen: true, modalOpen: true }, false],
    ['file.newView', { connectionOpen: true }, true],
    ['file.newView', {}, false],
    ['file.newIndex', { connectionOpen: true, activeTabType: 'table_data' }, true],
    ['file.newIndex', { connectionOpen: true, activeTabType: 'schema_designer' }, true],
    ['file.newIndex', { connectionOpen: true, activeTabType: 'sql_editor' }, false],
    ['file.newIndex', { connectionOpen: true, activeTabType: 'table_data', modalOpen: true }, false],
    ['file.newTable', { connectionOpen: true, modalOpen: true }, false],
    ['conn.switch', {}, true],
    ['conn.switch', { connectionOpen: true }, true],
    ['conn.switch', { connectionOpen: true, modalOpen: true }, false],
    ['conn.back', {}, true],
    ['conn.back', { connectionOpen: true }, true],
    ['conn.back', { connectionOpen: true, modalOpen: true }, false],
    ['conn.edit', { connectionOpen: true }, true],
    ['conn.edit', {}, false],
    ['conn.edit', { connectionOpen: true, modalOpen: true }, false],
    ['conn.reconnect', { connectionOpen: true }, true],
    ['conn.reconnect', {}, false],
    ['conn.reconnect', { connectionOpen: true, modalOpen: true }, false],
    ['conn.disconnect', { connectionOpen: true }, true],
    ['conn.disconnect', {}, false],
    ['conn.disconnect', { connectionOpen: true, modalOpen: true }, false],
    ['conn.refreshSchema', { connectionOpen: true }, true],
    ['conn.refreshSchema', {}, false],
    ['conn.refreshSchema', { connectionOpen: true, modalOpen: true }, false],
    // help commands: always available, except behind a modal
    ['help.docs', {}, true],
    ['help.docs', { connectionOpen: true }, true],
    ['help.docs', { modalOpen: true }, false],
    ['help.releaseNotes', {}, true],
    ['help.releaseNotes', { modalOpen: true }, false],
    ['help.reportIssue', {}, true],
    ['help.reportIssue', { modalOpen: true }, false],
    ['help.shortcuts', {}, true],
    ['help.shortcuts', { connectionOpen: true }, true],
    ['help.shortcuts', { modalOpen: true }, false],
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

  test('save, format and comment act inside the editor, so typing does not disable them', () => {
    const state = menuState(ctx({ activeTabType: 'sql_editor', textInputFocused: true }));
    expect(state.enabled['file.saveQuery']).toBe(true);
    expect(state.enabled['edit.formatSql']).toBe(true);
    expect(state.enabled['edit.toggleComment']).toBe(true);
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
    paneTabCount: 1,
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
        'file.newConnection',
        'file.newTable',
        'file.newView',
        'file.newFunction',
        'file.saveQuery',
        'edit.formatSql',
        'edit.toggleComment',
        'file.closeWindow',
        'conn.switch',
        'conn.back',
        'conn.edit',
        'conn.reconnect',
        'conn.disconnect',
        'conn.refreshSchema',
        'query.run',
        'query.runAll',
        'query.review',
        'view.palette',
        'view.toggleSidebar',
        'view.erd',
        'view.metrics',
        'view.activity',
        'file.closeTab',
        'view.tab.1',
        'view.tab.9',
        'view.splitRight',
        'view.splitDown',
        'help.docs',
        'help.releaseNotes',
        'help.reportIssue',
        'help.shortcuts',
      ].sort(),
    );
    expect(menuState(sqlTabOpen).enabled['conn.refreshTable']).toBe(false);
  });

  test('a table_data tab enables Refresh Table', () => {
    expect(menuState({ ...sqlTabOpen, activeTabType: 'table_data' }).enabled['conn.refreshTable']).toBe(true);
  });

  test('a table_data tab with a row selection and staged changes enables the grid and pending commands', () => {
    const tableTab = { ...sqlTabOpen, activeTabType: 'table_data' as const, selectedRowCount: 1, pendingCount: 2 };
    const state = menuState(tableTab);
    for (const id of ['edit.find', 'edit.insertRow', 'edit.deleteRows', 'file.export', 'query.commit', 'query.discard']) {
      expect(state.enabled[id]).toBe(true);
    }
    const typing = menuState({ ...tableTab, textInputFocused: true });
    expect(typing.enabled['edit.find']).toBe(false);
    expect(typing.enabled['edit.insertRow']).toBe(false);
    expect(typing.enabled['edit.deleteRows']).toBe(false);
    expect(typing.enabled['file.export']).toBe(true);
    expect(typing.enabled['query.commit']).toBe(true);
  });

  test('an open modal leaves only the allowInModal commands enabled', () => {
    expect(enabledIds({ ...sqlTabOpen, activeTabType: 'table_data', modalOpen: true })).toEqual(
      ['app.settings', 'file.closeWindow', 'view.palette'].sort(),
    );
  });

  test('no connection leaves only the connection-independent commands enabled', () => {
    expect(enabledIds(ctx())).toEqual(
      [
        'app.settings',
        'app.checkUpdates',
        'file.closeWindow',
        'view.palette',
        'file.newConnection',
        'conn.switch',
        'conn.back',
        'help.docs',
        'help.releaseNotes',
        'help.reportIssue',
        'help.shortcuts',
      ].sort(),
    );
  });

  test('the command palette stays available on the connection picker (no connection)', () => {
    const state = menuState(ctx({ connectionOpen: false }));
    expect(state.enabled['view.palette']).toBe(true);
    for (const id of ['view.erd', 'view.toggleSidebar', 'view.metrics', 'view.activity', 'file.newQuery', 'query.review']) {
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

  test('formats the tab and pane accelerators', () => {
    expect(shortcutLabel('file.closeTab', 'macos')).toBe('⌘W');
    expect(shortcutLabel('file.closeOthers', 'macos')).toBe('⌥⌘W');
    expect(shortcutLabel('file.reopenTab', 'macos')).toBe('⇧⌘T');
    expect(shortcutLabel('view.nextTab', 'macos')).toBe('⇧⌘]');
    expect(shortcutLabel('view.prevTab', 'macos')).toBe('⇧⌘[');
    expect(shortcutLabel('view.tab.1', 'macos')).toBe('⌘1');
    expect(shortcutLabel('view.tab.9', 'macos')).toBe('⌘9');
    expect(shortcutLabel('view.splitRight', 'macos')).toBe('⌥⌘\\');
    expect(shortcutLabel('view.splitRight', 'windows')).toBe('Ctrl+Alt+\\');
    expect(shortcutLabel('view.nextTab', 'linux')).toBe('Ctrl+Shift+]');
    expect(shortcutLabel('file.closeRight', 'macos')).toBe('');
    expect(shortcutLabel('view.splitDown', 'macos')).toBe('');
  });

  test('formats the editor accelerators', () => {
    expect(shortcutLabel('file.saveQuery', 'macos')).toBe('⌘S');
    expect(shortcutLabel('edit.formatSql', 'macos')).toBe('⇧⌘F');
    expect(shortcutLabel('edit.toggleComment', 'macos')).toBe('⌘/');
    expect(shortcutLabel('file.saveQuery', 'windows')).toBe('Ctrl+S');
    expect(shortcutLabel('edit.toggleComment', 'linux')).toBe('Ctrl+/');
  });

  test('formats the grid and pending-change accelerators', () => {
    expect(shortcutLabel('edit.find', 'macos')).toBe('⌘F');
    expect(shortcutLabel('edit.insertRow', 'macos')).toBe('⌘I');
    expect(shortcutLabel('edit.deleteRows', 'macos')).toBe('⌘⌫');
    expect(shortcutLabel('file.export', 'macos')).toBe('⌘E');
    expect(shortcutLabel('query.commit', 'macos')).toBe('⇧⌘S');
    expect(shortcutLabel('query.discard', 'macos')).toBe('');
    expect(shortcutLabel('edit.deleteRows', 'windows')).toBe('Ctrl+Backspace');
  });

  test('formats the connection and schema accelerators', () => {
    expect(shortcutLabel('file.newConnection', 'macos')).toBe('⌘N');
    expect(shortcutLabel('file.newTable', 'macos')).toBe('⇧⌘N');
    expect(shortcutLabel('conn.refreshSchema', 'macos')).toBe('⇧⌘R');
    expect(shortcutLabel('file.newConnection', 'windows')).toBe('Ctrl+N');
    expect(shortcutLabel('conn.refreshSchema', 'linux')).toBe('Ctrl+Shift+R');
    for (const id of ['conn.switch', 'conn.back', 'conn.edit', 'conn.reconnect', 'conn.disconnect']) {
      expect(shortcutLabel(id, 'macos')).toBe('');
    }
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
