import { afterEach, describe, expect, test } from 'bun:test';
import { getLocalContext, registerScope, type CommandScope } from './commandBus';
import { EMPTY_CONTEXT, type CommandContext } from './context';
import type { MenuHost } from './menuHost';
import { menuState } from './registry';
import { createMenuSync, installKeyboard, mergeMenuContext } from './useAppMenu';

type State = Parameters<MenuHost['applyState']>[0];

const scopes: CommandScope[] = [];
afterEach(() => {
  while (scopes.length > 0) scopes.pop()?.dispose();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createMenuSync', () => {
  test('serializes applyState so overlapping syncs cannot interleave', async () => {
    let ctx: CommandContext = { ...EMPTY_CONTEXT };
    const events: string[] = [];
    const pending: Array<ReturnType<typeof deferred>> = [];
    const host: MenuHost = {
      applyState(state: State) {
        const label = state.enabled['file.newQuery'] ? 'on' : 'off';
        events.push(`start:${label}`);
        const d = deferred();
        pending.push(d);
        return d.promise.then(() => {
          events.push(`end:${label}`);
        });
      },
    };
    const sync = createMenuSync({ getContext: () => ctx, onError: () => undefined });
    sync.setHost(host);
    sync.sync();
    ctx = { ...ctx, connectionOpen: true };
    sync.sync();
    await flush();
    expect(events).toEqual(['start:off']);
    pending[0].resolve();
    await flush();
    expect(events).toEqual(['start:off', 'end:off', 'start:on']);
    pending[1].resolve();
    await sync.idle();
    expect(events).toEqual(['start:off', 'end:off', 'start:on', 'end:on']);
  });

  test('a rejected applyState does not stop later applies', async () => {
    const applied: State[] = [];
    let first = true;
    const host: MenuHost = {
      async applyState(state) {
        if (first) {
          first = false;
          throw new Error('boom');
        }
        applied.push(state);
      },
    };
    const sync = createMenuSync({ getContext: () => EMPTY_CONTEXT, onError: () => undefined });
    sync.setHost(host);
    sync.sync();
    sync.sync();
    await sync.idle();
    expect(applied).toHaveLength(1);
  });

  test('sync without a host only records state; applies once a host is set', async () => {
    const applied: State[] = [];
    const host: MenuHost = {
      async applyState(state) {
        applied.push(state);
      },
    };
    const sync = createMenuSync({ getContext: () => EMPTY_CONTEXT, onError: () => undefined });
    sync.sync();
    await sync.idle();
    expect(applied).toHaveLength(0);
    sync.setHost(host);
    sync.sync();
    await sync.idle();
    expect(applied).toHaveLength(1);
    sync.setHost(null);
    sync.sync();
    await sync.idle();
    expect(applied).toHaveLength(1);
  });

  test('run ignores a command that is disabled in the latest state', () => {
    let calls = 0;
    scopes.push(registerScope('test', { 'conn.refreshTable': () => void calls++ }));
    let ctx: CommandContext = { ...EMPTY_CONTEXT, activeTabType: 'sql_editor' };
    const sync = createMenuSync({ getContext: () => ctx, onError: () => undefined });
    sync.sync();
    sync.run('conn.refreshTable');
    expect(calls).toBe(0);
    ctx = { ...ctx, activeTabType: 'table_data' };
    sync.sync();
    sync.run('conn.refreshTable');
    expect(calls).toBe(1);
  });

  test('run re-reads the context, so a stale typing flag is corrected before the gate', async () => {
    let calls = 0;
    scopes.push(registerScope('test', { 'edit.insertRow': () => void calls++ }));
    const applied: State[] = [];
    const host: MenuHost = {
      async applyState(state) {
        applied.push(state);
      },
    };
    // `typing` stands in for document.activeElement: it changes without any sync() call,
    // as when a focused input is removed from the DOM and no focusout fires.
    let typing = true;
    const sync = createMenuSync({
      getContext: () => ({ ...EMPTY_CONTEXT, activeTabType: 'table_data', textInputFocused: typing }),
      onError: () => undefined,
    });
    sync.setHost(host);
    sync.sync();
    typing = false;
    sync.run('edit.insertRow');
    expect(calls).toBe(1);
    await sync.idle();
    expect(applied.at(-1)?.enabled['edit.insertRow']).toBe(true);
    typing = true;
    sync.run('edit.insertRow');
    expect(calls).toBe(1);
    await sync.idle();
    expect(applied.at(-1)?.enabled['edit.insertRow']).toBe(false);
  });

  test('a local modalOpen:false does not clear an app-level modal', () => {
    const app: CommandContext = { ...EMPTY_CONTEXT, activeTabType: 'sql_editor', modalOpen: true };
    scopes.push(registerScope('test', {}));
    scopes[0].setContext({ modalOpen: false, sqlSelectionPresent: true });
    const ctx = mergeMenuContext(app, getLocalContext(), false);
    expect(ctx.modalOpen).toBe(true);
    expect(ctx.sqlSelectionPresent).toBe(true);
    expect(menuState(ctx).enabled['query.run']).toBe(false);
  });

  test('a local overlay (modalOpen:true) disables commands the app context allows', () => {
    let calls = 0;
    const scope = registerScope('test', { 'query.run': () => void calls++, 'file.closeTab': () => void calls++ });
    scopes.push(scope);
    const app: CommandContext = { ...EMPTY_CONTEXT, activeTabType: 'sql_editor', paneTabCount: 1 };
    const sync = createMenuSync({
      getContext: () => mergeMenuContext(app, getLocalContext(), false),
      onError: () => undefined,
    });
    scope.setContext({ modalOpen: true });
    sync.run('query.run');
    sync.run('file.closeTab');
    expect(calls).toBe(0);
    scope.setContext({ modalOpen: false });
    sync.run('query.run');
    expect(calls).toBe(1);
  });

  test('run reports sync and async handler errors through onError', async () => {
    const errors: unknown[] = [];
    scopes.push(
      registerScope('test', {
        'app.settings': () => {
          throw new Error('sync fail');
        },
        'app.checkUpdates': async () => {
          throw new Error('async fail');
        },
      }),
    );
    const sync = createMenuSync({ getContext: () => EMPTY_CONTEXT, onError: (e) => errors.push(e) });
    sync.sync();
    sync.run('app.settings');
    sync.run('app.checkUpdates');
    await flush();
    expect(errors.map((e) => (e as Error).message)).toEqual(['sync fail', 'async fail']);
  });
});

describe('createMenuSync.run result', () => {
  test('returns true for an enabled command with a handler and false for a disabled one', () => {
    scopes.push(registerScope('test', { 'conn.refreshTable': () => undefined }));
    let ctx: CommandContext = { ...EMPTY_CONTEXT, activeTabType: 'sql_editor' };
    const sync = createMenuSync({ getContext: () => ctx, onError: () => undefined });
    expect(sync.run('conn.refreshTable')).toBe(false);
    ctx = { ...ctx, activeTabType: 'table_data' };
    expect(sync.run('conn.refreshTable')).toBe(true);
  });
});

describe('installKeyboard', () => {
  type Listener = (e: Record<string, unknown>) => void;
  function setup(run: (id: string) => boolean = () => true) {
    const listeners = new Map<string, Listener>();
    const target = {
      addEventListener: (type: string, fn: Listener) => void listeners.set(type, fn),
      removeEventListener: (type: string, fn: Listener) => {
        if (listeners.get(type) === fn) listeners.delete(type);
      },
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const ran: string[] = [];
    let altTaps = 0;
    const dispose = installKeyboard({
      platform: 'windows',
      target,
      run: (id) => {
        ran.push(id);
        return run(id);
      },
      onAltTap: () => void altTaps++,
    });
    const fire = (type: string, props: Record<string, unknown> = {}) => {
      let prevented = false;
      listeners.get(type)?.({
        key: '',
        code: '',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => void (prevented = true),
        ...props,
      });
      return prevented;
    };
    return { listeners, ran, altTaps: () => altTaps, dispose, fire };
  }

  test('Ctrl+K runs the palette and prevents default', () => {
    const k = setup();
    expect(k.fire('keydown', { key: 'k', code: 'KeyK', ctrlKey: true })).toBe(true);
    expect(k.ran).toEqual(['view.palette']);
  });

  test('a key whose command does not run is left alone', () => {
    const k = setup(() => false);
    expect(k.fire('keydown', { key: 'Delete', code: 'Delete' })).toBe(false);
  });

  test('navigation mouse buttons are prevented, others are not', () => {
    const k = setup();
    expect(k.fire('mouseup', { button: 3 })).toBe(true);
    expect(k.fire('mousedown', { button: 4 })).toBe(true);
    expect(k.fire('mouseup', { button: 0 })).toBe(false);
  });

  test('Alt down then up calls onAltTap once', () => {
    const k = setup();
    k.fire('keydown', { key: 'Alt', code: 'AltLeft', altKey: true });
    k.fire('keyup', { key: 'Alt', code: 'AltLeft' });
    expect(k.altTaps()).toBe(1);
  });

  test('a mousedown between Alt down and up cancels the tap', () => {
    const k = setup();
    k.fire('keydown', { key: 'Alt', code: 'AltLeft', altKey: true });
    k.fire('mousedown', { button: 0 });
    k.fire('keyup', { key: 'Alt', code: 'AltLeft' });
    expect(k.altTaps()).toBe(0);
  });

  test('blur clears held Alt state, so only the later full tap counts', () => {
    const k = setup();
    k.fire('keydown', { key: 'Alt', code: 'AltLeft', altKey: true });
    k.fire('blur');
    k.fire('keydown', { key: 'Alt', code: 'AltLeft', altKey: true });
    k.fire('keyup', { key: 'Alt', code: 'AltLeft' });
    expect(k.altTaps()).toBe(1);
  });

  test('the returned function removes every listener', () => {
    const k = setup();
    expect([...k.listeners.keys()].sort()).toEqual(['blur', 'keydown', 'keyup', 'mousedown', 'mouseup']);
    k.dispose();
    expect(k.listeners.size).toBe(0);
  });
});
