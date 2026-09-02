import { describe, expect, test } from 'bun:test';
import { createHoverMenuController, HOVER_MENU_CLOSE_MS } from './hoverMenu';

function fakeScheduler() {
  let nextId = 0;
  const timers = new Map<number, () => void>();
  return {
    timers,
    schedule(fn: () => void, _ms: number) {
      nextId += 1;
      timers.set(nextId, fn);
      return nextId;
    },
    cancel(id: number) {
      timers.delete(id);
    },
    flush() {
      for (const fn of [...timers.values()]) {
        fn();
      }
      timers.clear();
    },
  };
}

describe('createHoverMenuController', () => {
  test('stays open when the pointer leaves and re-enters before the close delay', () => {
    let open = false;
    const clock = fakeScheduler();
    const menu = createHoverMenuController(
      (value) => {
        open = value;
      },
      clock
    );

    menu.enter();
    expect(open).toBe(true);

    menu.leave();
    expect(open).toBe(true);
    expect(clock.timers.size).toBe(1);

    menu.enter();
    expect(open).toBe(true);
    expect(clock.timers.size).toBe(0);

    clock.flush();
    expect(open).toBe(true);
  });

  test('closes only after the delayed leave fires', () => {
    let open = false;
    const clock = fakeScheduler();
    const menu = createHoverMenuController(
      (value) => {
        open = value;
      },
      clock,
      HOVER_MENU_CLOSE_MS
    );

    menu.enter();
    menu.leave();
    expect(open).toBe(true);
    clock.flush();
    expect(open).toBe(false);
  });
});
