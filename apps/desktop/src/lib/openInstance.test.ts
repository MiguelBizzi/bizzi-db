import { describe, expect, test } from 'bun:test';
import { INITIAL_OPEN_INSTANCE, nextOpenInstance } from './openInstance';

describe('nextOpenInstance', () => {
  test('starts closed with id 0', () => {
    expect(INITIAL_OPEN_INSTANCE).toEqual({ open: false, id: 0 });
  });

  test('each closed → open transition gets a new id', () => {
    let state = INITIAL_OPEN_INSTANCE;
    state = nextOpenInstance(state, true);
    expect(state).toEqual({ open: true, id: 1 });
    state = nextOpenInstance(state, false);
    state = nextOpenInstance(state, true);
    expect(state).toEqual({ open: true, id: 2 });
  });

  test('re-rendering without a transition keeps the same state object', () => {
    const open = nextOpenInstance(INITIAL_OPEN_INSTANCE, true);
    expect(nextOpenInstance(open, true)).toBe(open);
    const closed = nextOpenInstance(open, false);
    expect(closed).toEqual({ open: false, id: 1 });
    expect(nextOpenInstance(closed, false)).toBe(closed);
  });
});
