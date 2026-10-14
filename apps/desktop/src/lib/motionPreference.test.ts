import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_MOTION_PREFERENCE,
  MOTION_PREFERENCE_KEY,
  getMotionPreference,
  loadMotionPreference,
  parseMotionPreference,
  resolveReducedMotion,
  saveMotionPreference,
  setMotionPreference,
  subscribeMotionPreference,
} from './motionPreference';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};
const broken = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('resolveReducedMotion', () => {
  test.each([
    ['on', false, false],
    ['on', true, false],
    ['reduced', false, true],
    ['reduced', true, true],
    ['system', false, false],
    ['system', true, true],
  ] as const)('%s with system=%p → %p', (pref, system, expected) => {
    expect(resolveReducedMotion(pref, system)).toBe(expected);
  });
});

describe('parse / load / save', () => {
  test('default is on', () => {
    expect(DEFAULT_MOTION_PREFERENCE).toBe('on');
    expect(MOTION_PREFERENCE_KEY).toBe('bizzi.motion');
  });

  test.each([null, undefined, '', 'off', 'ON', 42, {}])('invalid %p parses to on', (raw) => {
    expect(parseMotionPreference(raw)).toBe('on');
  });

  test('valid values round-trip through storage', () => {
    const storage = memory();
    for (const pref of ['on', 'system', 'reduced'] as const) {
      saveMotionPreference(pref, storage);
      expect(storage.data['bizzi.motion']).toBe(pref);
      expect(loadMotionPreference(storage)).toBe(pref);
    }
  });

  test('empty, corrupt or throwing storage falls back to on', () => {
    expect(loadMotionPreference(memory())).toBe('on');
    expect(loadMotionPreference(memory({ 'bizzi.motion': 'nope' }))).toBe('on');
    expect(loadMotionPreference(broken)).toBe('on');
    expect(() => saveMotionPreference('reduced', broken)).not.toThrow();
  });
});

describe('store', () => {
  test('set updates the value and notifies until unsubscribed', () => {
    let calls = 0;
    const stop = subscribeMotionPreference(() => {
      calls += 1;
    });
    setMotionPreference('reduced');
    expect(getMotionPreference()).toBe('reduced');
    expect(calls).toBe(1);
    stop();
    setMotionPreference('on');
    expect(calls).toBe(1);
    expect(getMotionPreference()).toBe('on');
  });
});
