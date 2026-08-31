import { describe, expect, test } from 'bun:test';
import { clearToasts, dismissToast, subscribeToasts, toast } from './toast';

describe('toast store', () => {
  test('notifies subscribers and can dismiss a toast', () => {
    clearToasts();
    const seen: string[][] = [];
    const stop = subscribeToasts((toasts) => seen.push(toasts.map((item) => item.message)));
    const id = toast('Copied as CSV', 'success', 0);
    expect(seen.at(-1)).toEqual(['Copied as CSV']);
    dismissToast(id);
    expect(seen.at(-1)).toEqual([]);
    stop();
    clearToasts();
  });

  test('toast.success and toast.error set kind', () => {
    clearToasts();
    let kinds: string[] = [];
    const stop = subscribeToasts((toasts) => {
      kinds = toasts.map((item) => item.kind);
    });
    toast.success('Copied', 0);
    toast.error('Failed', 0);
    expect(kinds).toEqual(['success', 'error']);
    stop();
    clearToasts();
  });
});
