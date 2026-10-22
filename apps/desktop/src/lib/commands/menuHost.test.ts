import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { diffState, installMenu, type MenuApi } from './menuHost';
import type { MenuNode } from './menuModel';

interface FakeItem {
  opts: { id: string; text: string; accelerator?: string; action: () => void };
  calls: string[];
}

function makeFakeApi(opts: { menuThrows?: boolean; helpRoleThrows?: boolean; failOnce?: Set<string> } = {}) {
  const log: string[] = [];
  const items = new Map<string, FakeItem>();
  const predefined: Array<{ item: unknown; text?: string }> = [];
  const popups: unknown[] = [];
  const api: MenuApi = {
    Menu: {
      async new(o) {
        if (opts.menuThrows) throw new Error('boom');
        return {
          setAsAppMenu: async () => void log.push('setAsAppMenu'),
          setAsWindowMenu: async () => void log.push('setAsWindowMenu'),
          popup: async (at?: unknown) => {
            log.push('popup');
            popups.push(at);
          },
          items: o.items,
        };
      },
    },
    Submenu: {
      async new(o) {
        return {
          setAsWindowsMenuForNSApp: async () => void log.push('setAsWindowsMenuForNSApp'),
          setAsHelpMenuForNSApp: async () => {
            log.push('setAsHelpMenuForNSApp');
            if (opts.helpRoleThrows) throw new Error('role boom');
          },
          id: o.id,
          text: o.text,
          items: o.items,
        };
      },
    },
    MenuItem: {
      async new(o) {
        const fake: FakeItem = { opts: o, calls: [] };
        items.set(o.id, fake);
        return {
          setEnabled: async (b: boolean) => {
            if (opts.failOnce?.delete(`enabled:${o.id}`)) throw new Error('enabled boom');
            fake.calls.push(`enabled:${b}`);
          },
          setText: async (t: string) => {
            if (opts.failOnce?.delete(`text:${o.id}`)) throw new Error('text boom');
            fake.calls.push(`text:${t}`);
          },
        };
      },
    },
    PredefinedMenuItem: {
      async new(o) {
        predefined.push(o);
        return { predefined: o };
      },
    },
  };
  return { api, log, items, predefined, popups };
}

const model: MenuNode[] = [
  { kind: 'submenu', id: 'file', label: 'File', items: [{ kind: 'item', commandId: 'file.newQuery' }] },
  {
    kind: 'submenu',
    id: 'window',
    label: 'Window',
    role: 'window',
    items: [{ kind: 'predefined', item: 'minimize' }],
  },
  {
    kind: 'submenu',
    id: 'help',
    label: 'Help',
    role: 'help',
    items: [{ kind: 'item', commandId: 'app.checkUpdates' }],
  },
];

const alwaysTauri = () => true;

describe('diffState', () => {
  test('returns only the changed keys', () => {
    expect(diffState({ a: true, b: false, c: 'x' }, { a: true, b: true, c: 'y' })).toEqual({ b: true, c: 'y' });
  });

  test('includes keys absent from prev and omits keys absent from next', () => {
    expect(diffState({ a: true }, { b: false })).toEqual({ b: false });
  });
});

describe('installMenu', () => {
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
  });

  test('macOS sets the app menu once, never the window menu, and offers no popup', async () => {
    const { api, log } = makeFakeApi();
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(host).not.toBeNull();
    expect(log.filter((l) => l === 'setAsAppMenu')).toHaveLength(1);
    expect(log).not.toContain('setAsWindowMenu');
    expect(host?.popup).toBeUndefined();
    expect(log).not.toContain('popup');
  });

  test('windows attaches no menu to the window or app', async () => {
    const { api, log } = makeFakeApi();
    const host = await installMenu({ model, platform: 'windows', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(host).not.toBeNull();
    expect(log).not.toContain('setAsWindowMenu');
    expect(log).not.toContain('setAsAppMenu');
    expect(log).not.toContain('popup');
  });

  test('windows pops the menu up below the navbar at its left edge', async () => {
    const { api, log, popups } = makeFakeApi();
    const host = await installMenu({ model, platform: 'windows', onRun: () => {}, api, isTauri: alwaysTauri });
    await host?.popup?.();
    expect(log.filter((l) => l === 'popup')).toHaveLength(1);
    expect(popups[0]).toBeInstanceOf(LogicalPosition);
    expect(popups[0]).toMatchObject({ x: 16, y: 52 });
  });

  test('window and help roles are registered with NSApp on macOS only', async () => {
    const mac = makeFakeApi();
    await installMenu({ model, platform: 'macos', onRun: () => {}, api: mac.api, isTauri: alwaysTauri });
    expect(mac.log).toContain('setAsWindowsMenuForNSApp');
    expect(mac.log).toContain('setAsHelpMenuForNSApp');

    const win = makeFakeApi();
    await installMenu({ model, platform: 'windows', onRun: () => {}, api: win.api, isTauri: alwaysTauri });
    expect(win.log).not.toContain('setAsWindowsMenuForNSApp');
    expect(win.log).not.toContain('setAsHelpMenuForNSApp');
  });

  test('items are created with the registry label, accelerator and id', async () => {
    const { api, items } = makeFakeApi();
    await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(items.get('file.newQuery')?.opts.text).toBe('New Query Tab');
    expect(items.get('file.newQuery')?.opts.accelerator).toBe('CmdOrCtrl+T');
    expect(items.get('app.checkUpdates')?.opts.accelerator).toBeUndefined();
  });

  test('applyState sets enablement only on the first call for identical state', async () => {
    const { api, items } = makeFakeApi();
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    const state = { enabled: { 'file.newQuery': false, 'app.checkUpdates': true }, labels: {} };
    await host?.applyState(state);
    await host?.applyState(state);
    expect(items.get('file.newQuery')?.calls).toEqual(['enabled:false']);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['enabled:true']);
    await host?.applyState({ enabled: { 'file.newQuery': true, 'app.checkUpdates': true }, labels: {} });
    expect(items.get('file.newQuery')?.calls).toEqual(['enabled:false', 'enabled:true']);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['enabled:true']);
  });

  test('applyState calls setText only for changed labels and ignores unknown ids', async () => {
    const { api, items } = makeFakeApi();
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    await host?.applyState({ enabled: { nope: false }, labels: { 'file.newQuery': 'A', 'app.checkUpdates': 'B' } });
    await host?.applyState({ enabled: {}, labels: { 'file.newQuery': 'A', 'app.checkUpdates': 'C' } });
    expect(items.get('file.newQuery')?.calls).toEqual(['text:A']);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['text:B', 'text:C']);
  });

  test('a failing setEnabled does not abort the rest and is retried on the next applyState', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { api, items } = makeFakeApi({ failOnce: new Set(['enabled:file.newQuery']) });
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    const state = { enabled: { 'file.newQuery': false, 'app.checkUpdates': false }, labels: {} };
    await host?.applyState(state);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(items.get('file.newQuery')?.calls).toEqual([]);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['enabled:false']);
    await host?.applyState(state);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(items.get('file.newQuery')?.calls).toEqual(['enabled:false']);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['enabled:false']);
    await host?.applyState(state);
    expect(items.get('file.newQuery')?.calls).toEqual(['enabled:false']);
  });

  test('a failing setText is not cached and is retried on the next applyState', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { api, items } = makeFakeApi({ failOnce: new Set(['text:file.newQuery']) });
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    const state = { enabled: {}, labels: { 'file.newQuery': 'A', 'app.checkUpdates': 'B' } };
    await host?.applyState(state);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(items.get('file.newQuery')?.calls).toEqual([]);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['text:B']);
    await host?.applyState(state);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(items.get('file.newQuery')?.calls).toEqual(['text:A']);
    expect(items.get('app.checkUpdates')?.calls).toEqual(['text:B']);
  });

  test('a failing NSApp role registration is non-fatal: the host is still returned', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { api, log, items } = makeFakeApi({ helpRoleThrows: true });
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(host).not.toBeNull();
    expect(log).toContain('setAsAppMenu');
    expect(spy).toHaveBeenCalledTimes(1);
    await host?.applyState({ enabled: { 'file.newQuery': false }, labels: {} });
    expect(items.get('file.newQuery')?.calls).toEqual(['enabled:false']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('resolves null and logs once when the api throws', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { api } = makeFakeApi({ menuThrows: true });
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(host).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('item actions call onRun with the command id', async () => {
    const { api, items } = makeFakeApi();
    const ran: string[] = [];
    await installMenu({ model, platform: 'macos', onRun: (id) => ran.push(id), api, isTauri: alwaysTauri });
    items.get('file.newQuery')?.opts.action();
    expect(ran).toEqual(['file.newQuery']);
  });

  test('builds nested submenus: inner items are created, tracked by applyState and runnable', async () => {
    const nestedModel: MenuNode[] = [
      {
        kind: 'submenu',
        id: 'view',
        label: 'View',
        items: [
          { kind: 'item', commandId: 'view.nextTab' },
          {
            kind: 'submenu',
            id: 'view.goToTab',
            label: 'Go to Tab',
            items: [
              { kind: 'item', commandId: 'view.tab.1' },
              { kind: 'item', commandId: 'view.tab.9' },
            ],
          },
        ],
      },
    ];
    const { api, items } = makeFakeApi();
    const ran: string[] = [];
    let menuItems: unknown[] = [];
    const recordingApi: MenuApi = {
      ...api,
      Menu: {
        new: async (o) => {
          menuItems = o.items;
          return api.Menu.new(o);
        },
      },
    };
    const host = await installMenu({
      model: nestedModel,
      platform: 'macos',
      onRun: (id) => ran.push(id),
      api: recordingApi,
      isTauri: alwaysTauri,
    });
    const view = menuItems[0] as { id: string; items: unknown[] };
    const goToTab = view.items[1] as { id: string; text: string; items: unknown[] };
    expect(view.id).toBe('view');
    expect(goToTab.id).toBe('view.goToTab');
    expect(goToTab.text).toBe('Go to Tab');
    expect(goToTab.items).toHaveLength(2);
    expect(items.get('view.tab.9')?.opts.text).toBe('Last Tab');
    expect(items.get('view.tab.9')?.opts.accelerator).toBe('CmdOrCtrl+9');
    await host?.applyState({ enabled: { 'view.tab.1': false }, labels: {} });
    expect(items.get('view.tab.1')?.calls).toEqual(['enabled:false']);
    items.get('view.tab.9')?.opts.action();
    expect(ran).toEqual(['view.tab.9']);
  });

  test('resolves null without touching the api when not under Tauri', async () => {
    const { api, log, items, predefined } = makeFakeApi();
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: () => false });
    expect(host).toBeNull();
    expect(log).toEqual([]);
    expect(items.size).toBe(0);
    expect(predefined).toEqual([]);
  });

  test('maps predefined kinds, shows Quit as Exit off macOS and skips bringAllToFront', async () => {
    const predefinedModel: MenuNode[] = [
      {
        kind: 'submenu',
        id: 'x',
        label: 'X',
        items: [
          { kind: 'predefined', item: 'selectAll' },
          { kind: 'separator' },
          { kind: 'predefined', item: 'quit' },
          { kind: 'predefined', item: 'bringAllToFront' },
        ],
      },
    ];
    const mac = makeFakeApi();
    await installMenu({
      model: predefinedModel,
      platform: 'macos',
      onRun: () => {},
      api: mac.api,
      isTauri: alwaysTauri,
    });
    expect(mac.predefined.map((p) => p.item)).toEqual(['SelectAll', 'Separator', 'Quit']);
    expect(mac.predefined[2]?.text).toBeUndefined();

    const win = makeFakeApi();
    await installMenu({
      model: predefinedModel,
      platform: 'linux',
      onRun: () => {},
      api: win.api,
      isTauri: alwaysTauri,
    });
    expect(win.predefined[2]).toEqual({ item: 'Quit', text: 'Exit' });
  });
  test('windows shows the shortcut as tab-separated text and registers no accelerator', async () => {
    const tableModel: MenuNode[] = [
      { kind: 'submenu', id: 'file', label: 'File', items: [{ kind: 'item', commandId: 'file.newTable' }] },
      {
        kind: 'submenu',
        id: 'query',
        label: 'Query',
        items: [{ kind: 'item', commandId: 'query.run' }],
      },
    ];
    const built = makeFakeApi();
    const win = await installMenu({
      model: tableModel,
      platform: 'windows',
      onRun: () => {},
      api: built.api,
      isTauri: alwaysTauri,
    });
    const table = built.items.get('file.newTable');
    expect(table?.opts.text).toBe('New Table…\tCtrl+Shift+N');
    expect(table?.opts).not.toHaveProperty('accelerator');
    await win?.applyState({ enabled: {}, labels: { 'query.run': 'Run Selection' } });
    expect(built.items.get('query.run')?.calls).toContain('text:Run Selection\tCtrl+Enter');
  });

  test('macOS keeps the native accelerator and the bare label', async () => {
    const built = makeFakeApi();
    await installMenu({
      model: [{ kind: 'submenu', id: 'file', label: 'File', items: [{ kind: 'item', commandId: 'file.newTable' }] }],
      platform: 'macos',
      onRun: () => {},
      api: built.api,
      isTauri: alwaysTauri,
    });
    const table = built.items.get('file.newTable');
    expect(table?.opts.text).toBe('New Table…');
    expect(table?.opts.accelerator).toBe('CmdOrCtrl+Shift+N');
  });
});
