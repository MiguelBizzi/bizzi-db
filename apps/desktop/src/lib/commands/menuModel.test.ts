import { describe, expect, test } from 'bun:test';
import { buildMenuModel, type MenuNode } from './menuModel';
import { adaptMenuModel } from './platformAdapter';
import { COMMANDS } from './registry';

function walk(nodes: MenuNode[], visit: (node: MenuNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.kind === 'submenu') walk(node.items, visit);
  }
}

function itemIds(nodes: MenuNode[]): string[] {
  const ids: string[] = [];
  walk(nodes, (n) => {
    if (n.kind === 'item') ids.push(n.commandId);
  });
  return ids;
}

function submenu(model: MenuNode[], id: string): Extract<MenuNode, { kind: 'submenu' }> {
  const found = model.find((n) => n.kind === 'submenu' && n.id === id);
  if (!found || found.kind !== 'submenu') throw new Error(`no submenu ${id}`);
  return found;
}

const HELP_ITEMS: MenuNode[] = [
  { kind: 'item', commandId: 'help.docs' },
  { kind: 'item', commandId: 'help.releaseNotes' },
  { kind: 'item', commandId: 'help.reportIssue' },
  { kind: 'separator' },
  { kind: 'item', commandId: 'help.shortcuts' },
];

describe('buildMenuModel', () => {
  test('top-level submenu ids on macOS', () => {
    const ids = buildMenuModel().map((n) => (n.kind === 'submenu' ? n.id : n.kind));
    expect(ids).toEqual(['app', 'file', 'edit', 'query', 'connection', 'view', 'window', 'help']);
  });

  test('submenu labels and window and help roles', () => {
    const model = buildMenuModel();
    expect(model.map((n) => (n.kind === 'submenu' ? n.label : ''))).toEqual([
      'Bizzi DB',
      'File',
      'Edit',
      'Query',
      'Connection',
      'View',
      'Window',
      'Help',
    ]);
    expect(submenu(model, 'window').role).toBe('window');
    expect(submenu(model, 'help').role).toBe('help');
  });

  test('every command appears in the model exactly once and every item is registered', () => {
    const ids = itemIds(buildMenuModel());
    const known = new Set(COMMANDS.map((c) => c.id));
    for (const id of ids) expect(known.has(id)).toBe(true);
    for (const cmd of COMMANDS) {
      expect(ids.filter((id) => id === cmd.id).length).toBe(1);
    }
    expect(ids.length).toBe(COMMANDS.length);
  });

  test('edit submenu begins with predefined undo', () => {
    expect(submenu(buildMenuModel(), 'edit').items[0]).toEqual({ kind: 'predefined', item: 'undo' });
  });

  test('edit submenu holds the standard items, the grid commands, then toggle comment and format SQL', () => {
    expect(submenu(buildMenuModel(), 'edit').items).toEqual([
      { kind: 'predefined', item: 'undo' },
      { kind: 'predefined', item: 'redo' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'cut' },
      { kind: 'predefined', item: 'copy' },
      { kind: 'predefined', item: 'paste' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'selectAll' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'edit.find' },
      { kind: 'item', commandId: 'edit.insertRow' },
      { kind: 'item', commandId: 'edit.deleteRows' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'edit.toggleComment' },
      { kind: 'item', commandId: 'edit.formatSql' },
    ]);
  });

  test('query submenu holds run, run all, a separator, then commit, discard and review pending changes', () => {
    expect(submenu(buildMenuModel(), 'query').items).toEqual([
      { kind: 'item', commandId: 'query.run' },
      { kind: 'item', commandId: 'query.runAll' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'query.commit' },
      { kind: 'item', commandId: 'query.discard' },
      { kind: 'item', commandId: 'query.review' },
    ]);
  });

  test('file submenu holds the new items, save and export, the close/reopen tab group, then close window', () => {
    expect(submenu(buildMenuModel(), 'file').items).toEqual([
      { kind: 'item', commandId: 'file.newQuery' },
      { kind: 'item', commandId: 'file.newConnection' },
      { kind: 'item', commandId: 'file.newTable' },
      { kind: 'item', commandId: 'file.newView' },
      { kind: 'item', commandId: 'file.newFunction' },
      { kind: 'item', commandId: 'file.newIndex' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'file.saveQuery' },
      { kind: 'item', commandId: 'file.export' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'file.closeTab' },
      { kind: 'item', commandId: 'file.closeOthers' },
      { kind: 'item', commandId: 'file.closeRight' },
      { kind: 'item', commandId: 'file.reopenTab' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'file.closeWindow' },
    ]);
  });

  test('connection submenu holds switch, back, edit, reconnect, disconnect, then the refresh commands', () => {
    expect(submenu(buildMenuModel(), 'connection').items).toEqual([
      { kind: 'item', commandId: 'conn.switch' },
      { kind: 'item', commandId: 'conn.back' },
      { kind: 'item', commandId: 'conn.edit' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'conn.reconnect' },
      { kind: 'item', commandId: 'conn.disconnect' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'conn.refreshSchema' },
      { kind: 'item', commandId: 'conn.refreshTable' },
    ]);
  });

  test('view submenu holds panels, tab navigation, the Go to Tab submenu, splits and fullscreen', () => {
    const goToTab: MenuNode = {
      kind: 'submenu',
      id: 'view.goToTab',
      label: 'Go to Tab',
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ kind: 'item', commandId: `view.tab.${n}` })),
    };
    expect(submenu(buildMenuModel(), 'view').items).toEqual([
      { kind: 'item', commandId: 'view.palette' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'view.erd' },
      { kind: 'item', commandId: 'view.metrics' },
      { kind: 'item', commandId: 'view.activity' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'view.nextTab' },
      { kind: 'item', commandId: 'view.prevTab' },
      goToTab,
      { kind: 'separator' },
      { kind: 'item', commandId: 'view.splitRight' },
      { kind: 'item', commandId: 'view.splitDown' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'fullscreen' },
    ]);
  });

  test('the Go to Tab submenu has nine items, reached by the recursive walker', () => {
    const view = submenu(buildMenuModel(), 'view');
    const goToTab = view.items.find((n) => n.kind === 'submenu' && n.id === 'view.goToTab');
    if (!goToTab || goToTab.kind !== 'submenu') throw new Error('no Go to Tab submenu');
    expect(goToTab.items).toHaveLength(9);
    expect(itemIds([view]).filter((id) => id.startsWith('view.tab.'))).toHaveLength(9);
  });

  test('app submenu shape', () => {
    expect(submenu(buildMenuModel(), 'app').items).toEqual([
      { kind: 'predefined', item: 'about' },
      { kind: 'item', commandId: 'app.checkUpdates' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'app.settings' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'services' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'hide' },
      { kind: 'predefined', item: 'hideOthers' },
      { kind: 'predefined', item: 'showAll' },
      { kind: 'separator' },
      { kind: 'predefined', item: 'quit' },
    ]);
  });

  test('help submenu holds the links, a separator, then Keyboard Shortcuts', () => {
    expect(submenu(buildMenuModel(), 'help').items).toEqual(HELP_ITEMS);
  });
});

describe('adaptMenuModel', () => {
  test('macos returns an equal model', () => {
    const model = buildMenuModel();
    expect(adaptMenuModel(model, 'macos')).toEqual(model);
  });

  for (const platform of ['windows', 'linux'] as const) {
    describe(platform, () => {
      test('removes the app submenu', () => {
        const out = adaptMenuModel(buildMenuModel(), platform);
        expect(out.some((n) => n.kind === 'submenu' && n.id === 'app')).toBe(false);
        expect(out.map((n) => (n.kind === 'submenu' ? n.id : n.kind))).toEqual([
          'file',
          'edit',
          'query',
          'connection',
          'view',
          'window',
          'help',
        ]);
      });

      test('edit ends with Settings after a separator', () => {
        const items = submenu(adaptMenuModel(buildMenuModel(), platform), 'edit').items;
        expect(items.slice(-2)).toEqual([{ kind: 'separator' }, { kind: 'item', commandId: 'app.settings' }]);
      });

      test('file ends with predefined quit after a separator', () => {
        const items = submenu(adaptMenuModel(buildMenuModel(), platform), 'file').items;
        expect(items.slice(-2)).toEqual([{ kind: 'separator' }, { kind: 'predefined', item: 'quit' }]);
      });

      test('help submenu holds about and check for updates, a separator, then the help items', () => {
        const out = adaptMenuModel(buildMenuModel(), platform);
        expect(out.filter((n) => n.kind === 'submenu' && n.id === 'help').length).toBe(1);
        const help = submenu(out, 'help');
        expect(help.label).toBe('Help');
        expect(help.role).toBe('help');
        expect(help.items).toEqual([
          { kind: 'predefined', item: 'about' },
          { kind: 'item', commandId: 'app.checkUpdates' },
          { kind: 'separator' },
          ...HELP_ITEMS,
        ]);
      });

      test('creates a help submenu with about and check for updates when the model has none', () => {
        const model = buildMenuModel().filter((n) => !(n.kind === 'submenu' && n.id === 'help'));
        expect(submenu(adaptMenuModel(model, platform), 'help').items).toEqual([
          { kind: 'predefined', item: 'about' },
          { kind: 'item', commandId: 'app.checkUpdates' },
        ]);
      });

      test('drops services, hide, hideOthers and showAll', () => {
        const dropped = new Set(['services', 'hide', 'hideOthers', 'showAll']);
        let found = false;
        walk(adaptMenuModel(buildMenuModel(), platform), (n) => {
          if (n.kind === 'predefined' && dropped.has(n.item)) found = true;
        });
        expect(found).toBe(false);
      });

      test('keeps every command exactly once', () => {
        const ids = itemIds(adaptMenuModel(buildMenuModel(), platform));
        for (const cmd of COMMANDS) expect(ids.filter((id) => id === cmd.id).length).toBe(1);
      });

      test('keeps the nested Go to Tab submenu inside View', () => {
        const view = submenu(adaptMenuModel(buildMenuModel(), platform), 'view');
        expect(view).toEqual(submenu(buildMenuModel(), 'view'));
      });

      test('does not mutate its input', () => {
        const model = buildMenuModel();
        const snapshot = structuredClone(model);
        adaptMenuModel(model, platform);
        expect(model).toEqual(snapshot);
      });

      test('merges into an existing help submenu instead of creating a second', () => {
        const model: MenuNode[] = [
          ...buildMenuModel().filter((n) => !(n.kind === 'submenu' && n.id === 'help')),
          {
            kind: 'submenu',
            id: 'help',
            label: 'Help',
            role: 'help',
            items: [{ kind: 'item', commandId: 'help.docs' }],
          },
        ];
        const snapshot = structuredClone(model);
        const out = adaptMenuModel(model, platform);
        expect(model).toEqual(snapshot);
        expect(out.filter((n) => n.kind === 'submenu' && n.id === 'help').length).toBe(1);
        expect(submenu(out, 'help').items).toEqual([
          { kind: 'predefined', item: 'about' },
          { kind: 'item', commandId: 'app.checkUpdates' },
          { kind: 'separator' },
          { kind: 'item', commandId: 'help.docs' },
        ]);
      });
    });
  }
});
