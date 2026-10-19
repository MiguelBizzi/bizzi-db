import { describe, expect, test } from 'bun:test';
import { createTabFormStore } from './tabFormState';

describe('tab form store', () => {
  test('keeps a value per tab and field until the tab closes', () => {
    const store = createTabFormStore();
    expect(store.read('t1', 'draft')).toBeUndefined();
    store.write('t1', 'draft', { name: 'orders_v' });
    store.write('t1', 'schema', 'shop');
    store.write('t2', 'draft', { name: 'other' });
    expect(store.read('t1', 'draft')).toEqual({ name: 'orders_v' });
    expect(store.has('t1', 'schema')).toBe(true);

    store.prune(['t2']);
    expect(store.has('t1', 'draft')).toBe(false);
    expect(store.has('t1', 'schema')).toBe(false);
    expect(store.read('t2', 'draft')).toEqual({ name: 'other' });
  });

  test('tab ids containing the separator do not collide', () => {
    const store = createTabFormStore();
    store.write('a:b', 'c', 1);
    store.write('a', 'b:c', 2);
    expect(store.read('a:b', 'c')).toBe(1);
    expect(store.read('a', 'b:c')).toBe(2);
    store.prune(['a']);
    expect(store.has('a:b', 'c')).toBe(false);
    expect(store.read('a', 'b:c')).toBe(2);
  });
});
