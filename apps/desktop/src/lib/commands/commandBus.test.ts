import { afterEach, describe, expect, test } from 'bun:test';
import {
  getLocalContext,
  registerScope,
  runCommand,
  subscribeBus,
  type CommandHandler,
  type CommandScope,
} from './commandBus';

const created: CommandScope[] = [];

function register(owner: string, handlers: Record<string, CommandHandler>): CommandScope {
  const scope = registerScope(owner, handlers);
  created.push(scope);
  return scope;
}

afterEach(() => {
  for (const scope of created) scope.dispose();
  created.length = 0;
});

describe('runCommand', () => {
  test('the most recently registered scope wins, claim() moves a scope to the top', () => {
    const calls: string[] = [];
    const a = register('a', { 'query.run': () => void calls.push('a') });
    register('b', { 'query.run': () => void calls.push('b') });

    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['b']);

    a.claim();
    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['b', 'a']);
  });

  test('disposing the top scope falls back to the previous one', () => {
    const calls: string[] = [];
    register('a', { 'query.run': () => void calls.push('a') });
    const b = register('b', { 'query.run': () => void calls.push('b') });

    b.dispose();
    b.dispose();
    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['a']);
  });

  test('skips scopes that do not own the id', () => {
    const calls: string[] = [];
    register('a', { 'query.run': () => void calls.push('a') });
    register('b', { 'grid.refresh': () => void calls.push('b') });

    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['a']);
  });

  test('returns false when no scope owns the id', () => {
    expect(runCommand('nope')).toBe(false);
    register('a', { 'query.run': () => {} });
    expect(runCommand('nope')).toBe(false);
  });

  test('a throwing handler calls onError once and still returns true', () => {
    const boom = new Error('boom');
    register('a', {
      'query.run': () => {
        throw boom;
      },
    });
    const errors: unknown[] = [];

    expect(runCommand('query.run', (e) => errors.push(e))).toBe(true);
    expect(errors).toEqual([boom]);
  });

  test('a rejecting handler calls onError once and returns true', async () => {
    const boom = new Error('async boom');
    register('a', { 'query.run': () => Promise.reject(boom) });
    const errors: unknown[] = [];

    expect(runCommand('query.run', (e) => errors.push(e))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toEqual([boom]);
  });

  test('errors are swallowed without onError', async () => {
    register('a', {
      'sync.fail': () => {
        throw new Error('x');
      },
      'async.fail': () => Promise.reject(new Error('y')),
    });

    expect(runCommand('sync.fail')).toBe(true);
    expect(runCommand('async.fail')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('getLocalContext', () => {
  test('merges patches in claim order, later-claimed wins per field', () => {
    const a = register('a', {});
    const b = register('b', {});
    a.setContext({ selectedRowCount: 1, pendingCount: 2 });
    b.setContext({ selectedRowCount: 5 });

    expect(getLocalContext()).toEqual({ selectedRowCount: 5, pendingCount: 2 });

    a.claim();
    expect(getLocalContext()).toEqual({ selectedRowCount: 1, pendingCount: 2 });
  });

  test('disposing a scope removes its patch', () => {
    const a = register('a', {});
    const b = register('b', {});
    a.setContext({ pendingCount: 2 });
    b.setContext({ selectedRowCount: 5 });

    b.dispose();
    expect(getLocalContext()).toEqual({ pendingCount: 2 });
  });

  test('setContext merges into the scope patch', () => {
    const a = register('a', {});
    a.setContext({ pendingCount: 2 });
    a.setContext({ selectedRowCount: 3 });
    expect(getLocalContext()).toEqual({ pendingCount: 2, selectedRowCount: 3 });
  });
});

describe('subscribeBus', () => {
  test('fires on register, claim, setContext and dispose', () => {
    let count = 0;
    const unsubscribe = subscribeBus(() => count++);
    try {
      const a = register('a', {});
      expect(count).toBe(1);
      a.claim();
      expect(count).toBe(2);
      a.setContext({ pendingCount: 1 });
      expect(count).toBe(3);
      a.dispose();
      expect(count).toBe(4);
    } finally {
      unsubscribe();
    }
  });

  test('unsubscribe stops notifications', () => {
    let count = 0;
    const unsubscribe = subscribeBus(() => count++);
    unsubscribe();
    register('a', {});
    expect(count).toBe(0);
  });

  test('a throwing listener does not break other listeners or the operation', () => {
    let count = 0;
    const off1 = subscribeBus(() => {
      throw new Error('listener');
    });
    const off2 = subscribeBus(() => count++);
    try {
      const a = register('a', { 'query.run': () => {} });
      a.setContext({ pendingCount: 1 });
      expect(count).toBe(2);
      expect(getLocalContext()).toEqual({ pendingCount: 1 });
      expect(runCommand('query.run')).toBe(true);
    } finally {
      off1();
      off2();
    }
  });
});

describe('active scopes', () => {
  test('an inactive scope registered after an active one does not take over, nor leak its context', () => {
    const calls: string[] = [];
    register('a', { 'query.run': () => void calls.push('a') });
    const b = register('b', { 'query.run': () => void calls.push('b') });
    b.setActive(false);
    b.setContext({ sqlSelectionPresent: true });

    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['a']);
    expect(getLocalContext()).toEqual({});
  });

  test('setActive(true) makes the scope win and its patch appear', () => {
    const calls: string[] = [];
    register('a', { 'query.run': () => void calls.push('a') });
    const b = register('b', { 'query.run': () => void calls.push('b') });
    b.setActive(false);
    b.setContext({ sqlSelectionPresent: true });

    b.setActive(true);
    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['b']);
    expect(getLocalContext()).toEqual({ sqlSelectionPresent: true });
  });

  test('claim() activates an inactive scope and moves it to the top', () => {
    const calls: string[] = [];
    const a = register('a', { 'query.run': () => void calls.push('a') });
    register('b', { 'query.run': () => void calls.push('b') });
    a.setActive(false);

    a.claim();
    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['a']);
  });

  test('with only inactive scopes owning the id, the topmost one runs', () => {
    const calls: string[] = [];
    const a = register('a', { 'query.run': () => void calls.push('a') });
    const b = register('b', { 'query.run': () => void calls.push('b') });
    register('c', { 'other.cmd': () => {} });
    a.setActive(false);
    b.setActive(false);

    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['b']);
  });

  test('an active scope that owns the id beats an inactive one above it', () => {
    const calls: string[] = [];
    register('a', { 'query.run': () => void calls.push('a') });
    const b = register('b', { 'query.run': () => void calls.push('b') });
    const c = register('c', { 'query.run': () => void calls.push('c') });
    c.setActive(false);
    b.setActive(false);

    expect(runCommand('query.run')).toBe(true);
    expect(calls).toEqual(['a']);
  });

  test('setActive with an unchanged value does not notify, a change does', () => {
    const a = register('a', {});
    let count = 0;
    const unsubscribe = subscribeBus(() => count++);
    try {
      a.setActive(true);
      expect(count).toBe(0);
      a.setActive(false);
      expect(count).toBe(1);
      a.setActive(false);
      expect(count).toBe(1);
      a.setActive(true);
      expect(count).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  test('setActive after dispose is a no-op', () => {
    const a = register('a', { 'query.run': () => {} });
    a.dispose();
    let count = 0;
    const unsubscribe = subscribeBus(() => count++);
    try {
      a.setActive(false);
      expect(count).toBe(0);
      expect(runCommand('query.run')).toBe(false);
    } finally {
      unsubscribe();
    }
  });
});
