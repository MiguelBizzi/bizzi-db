import { describe, expect, it } from 'vitest';
import { createAltTapTracker } from './altTap';

describe('createAltTapTracker', () => {
  it('clean tap', () => {
    const t = createAltTapTracker();
    t.keyDown('Alt');
    expect(t.keyUp('Alt')).toBe(true);
  });

  it('chord is not a tap', () => {
    const t = createAltTapTracker();
    t.keyDown('Alt');
    t.keyDown('F4');
    expect(t.keyUp('Alt')).toBe(false);
  });

  it('Alt released after blur is not a tap', () => {
    const t = createAltTapTracker();
    t.keyDown('Alt');
    t.interrupt();
    expect(t.keyUp('Alt')).toBe(false);
  });

  it('click during Alt is not a tap', () => {
    const t = createAltTapTracker();
    t.keyDown('Alt');
    t.interrupt();
    expect(t.keyUp('Alt')).toBe(false);
  });

  it('repeat keydown of Alt still a tap', () => {
    const t = createAltTapTracker();
    t.keyDown('Alt');
    t.keyDown('Alt');
    t.keyDown('Alt');
    expect(t.keyUp('Alt')).toBe(true);
  });
});
