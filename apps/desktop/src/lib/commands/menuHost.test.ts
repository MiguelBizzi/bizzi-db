import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { diffState, installMenu, type MenuApi } from './menuHost';
import type { MenuNode } from './menuModel';

interface FakeItem {
  opts: { id: string; text: string; accelerator?: string; action: () => void };
  calls: string[];
}

function makeFakeApi(opts: { menuThrows?: boolean } = {}) {
  const log: string[] = [];
  const items = new Map<string, FakeItem>();
  const predefined: Array<{ item: unknown; text?: string }> = [];
  const api: MenuApi = {
    Menu: {
      async new(o) {
        if (opts.menuThrows) throw new Error('boom');
        return {
          setAsAppMenu: async () => void log.push('setAsAppMenu'),
          setAsWindowMenu: async () => void log.push('setAsWindowMenu'),
          items: o.items,
        };
      },
    },
    Submenu: {
      async new(o) {
        return {
          setAsWindowsMenuForNSApp: async () => void log.push('setAsWindowsMenuForNSApp'),
          setAsHelpMenuForNSApp: async () => void log.push('setAsHelpMenuForNSApp'),
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
          setEnabled: async (b: boolean) => void fake.calls.push(`enabled:${b}`),
          setText: async (t: string) => void fake.calls.push(`text:${t}`),
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
  return { api, log, items, predefined };
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

  test('macOS sets the app menu once and never the window menu', async () => {
    const { api, log } = makeFakeApi();
    const host = await installMenu({ model, platform: 'macos', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(host).not.toBeNull();
    expect(log.filter((l) => l === 'setAsAppMenu')).toHaveLength(1);
    expect(log).not.toContain('setAsWindowMenu');
  });

  test('windows sets the window menu and not the app menu', async () => {
    const { api, log } = makeFakeApi();
    await installMenu({ model, platform: 'windows', onRun: () => {}, api, isTauri: alwaysTauri });
    expect(log).toContain('setAsWindowMenu');
    expect(log).not.toContain('setAsAppMenu');
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
});
