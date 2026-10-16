import { afterEach, describe, expect, test } from 'bun:test';
import { registerScope, type CommandScope } from './commandBus';
import { EMPTY_CONTEXT, type CommandContext } from './context';
import type { MenuHost } from './menuHost';
import { createMenuSync } from './useAppMenu';

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
