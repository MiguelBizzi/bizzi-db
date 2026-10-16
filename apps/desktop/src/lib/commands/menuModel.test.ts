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

describe('buildMenuModel', () => {
  test('top-level submenu ids on macOS', () => {
    const ids = buildMenuModel().map((n) => (n.kind === 'submenu' ? n.id : n.kind));
    expect(ids).toEqual(['app', 'file', 'edit', 'query', 'connection', 'view', 'window']);
  });

  test('submenu labels and window role', () => {
    const model = buildMenuModel();
    expect(model.map((n) => (n.kind === 'submenu' ? n.label : ''))).toEqual([
      'Bizzi DB',
      'File',
      'Edit',
      'Query',
      'Connection',
      'View',
      'Window',
    ]);
    expect(submenu(model, 'window').role).toBe('window');
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

  test('query submenu holds run, run all, a separator, then review pending changes', () => {
    expect(submenu(buildMenuModel(), 'query').items).toEqual([
      { kind: 'item', commandId: 'query.run' },
      { kind: 'item', commandId: 'query.runAll' },
      { kind: 'separator' },
      { kind: 'item', commandId: 'query.review' },
    ]);
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

  test('there is no help submenu yet', () => {
    expect(buildMenuModel().some((n) => n.kind === 'submenu' && n.id === 'help')).toBe(false);
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

      test('help submenu holds about and check for updates', () => {
        const help = submenu(adaptMenuModel(buildMenuModel(), platform), 'help');
        expect(help.label).toBe('Help');
        expect(help.role).toBe('help');
        expect(help.items).toEqual([
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

      test('does not mutate its input', () => {
        const model = buildMenuModel();
        const snapshot = structuredClone(model);
        adaptMenuModel(model, platform);
        expect(model).toEqual(snapshot);
      });

      test('merges into an existing help submenu instead of creating a second', () => {
        const model: MenuNode[] = [
          ...buildMenuModel(),
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
