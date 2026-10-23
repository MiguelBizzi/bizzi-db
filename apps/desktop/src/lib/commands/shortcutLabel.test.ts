import { afterEach, describe, expect, test } from 'bun:test';
import { currentPlatform } from './shortcutLabel';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function stubUserAgent(userAgent: string) {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true });
}

afterEach(() => {
  delete globalThis.__BIZZI_PLATFORM__;
  if (original) Object.defineProperty(globalThis, 'navigator', original);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

describe('currentPlatform', () => {
  test('injected platform wins over the user agent', () => {
    globalThis.__BIZZI_PLATFORM__ = 'linux';
    stubUserAgent(MAC_UA);
    expect(currentPlatform()).toBe('linux');
  });

  test('invalid injected value falls back', () => {
    globalThis.__BIZZI_PLATFORM__ = 'beos';
    stubUserAgent(MAC_UA);
    expect(currentPlatform()).toBe('macos');
  });

  test('bun default stays macos', () => {
    expect(currentPlatform()).toBe('macos');
  });
});
