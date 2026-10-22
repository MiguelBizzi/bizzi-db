import { describe, expect, test } from 'bun:test';
import { secretStoreName } from './platformCopy';

describe('secretStoreName', () => {
  test('names the store per platform', () => {
    expect(secretStoreName('macos')).toBe('system keychain');
    expect(secretStoreName('linux')).toBe('system keychain');
    expect(secretStoreName('windows')).toBe('Windows Credential Manager');
  });
});
