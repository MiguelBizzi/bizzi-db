import { describe, expect, it } from 'bun:test';
import { validateCollectionName, validateDatabaseName } from './collectionName';

describe('validateCollectionName', () => {
  it('accepts ordinary names', () => {
    expect(validateCollectionName('users')).toBeNull();
    expect(validateCollectionName('audit.log')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateCollectionName('')).toBe('Enter a collection name.');
  });

  it('rejects $ and the null character', () => {
    expect(validateCollectionName('a$b')).toBe('A collection name cannot contain "$".');
    expect(validateCollectionName('a\0b')).toBe('A collection name cannot contain a null character.');
  });

  it('rejects the system. prefix', () => {
    expect(validateCollectionName('system.users')).toBe('A collection name cannot start with "system.".');
    expect(validateCollectionName('systems')).toBeNull();
  });
});

describe('validateDatabaseName', () => {
  it('accepts ordinary names', () => {
    expect(validateDatabaseName('shop')).toBeNull();
    expect(validateDatabaseName('shop-2_x')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateDatabaseName('')).toBe('Enter a database name.');
  });

  it('rejects each forbidden character', () => {
    for (const ch of ['/', '\\', '.', ' ', '"', '$', '*', '<', '>', ':', '|', '?', '\0']) {
      expect(validateDatabaseName(`a${ch}b`)).not.toBeNull();
    }
  });

  it('limits the name to 64 bytes, not characters', () => {
    expect(validateDatabaseName('a'.repeat(64))).toBeNull();
    expect(validateDatabaseName('a'.repeat(65))).toBe('A database name is at most 64 bytes.');
    expect(validateDatabaseName('é'.repeat(33))).toBe('A database name is at most 64 bytes.');
  });
});
