import { describe, expect, test } from 'bun:test';
import { secretStoreLongName, secretStoreName } from './platformCopy';

describe('secretStoreName', () => {
  test('names the store per platform', () => {
    expect(secretStoreName('macos')).toBe('system keychain');
    expect(secretStoreName('linux')).toBe('system keychain');
    expect(secretStoreName('windows')).toBe('Windows Credential Manager');
  });
});

describe('secretStoreLongName', () => {
  test('keeps the existing wording off Windows', () => {
    expect(secretStoreLongName('macos')).toBe('operating system keychain');
    expect(secretStoreLongName('linux')).toBe('operating system keychain');
    expect(secretStoreLongName('windows')).toBe('Windows Credential Manager');
  });
});
