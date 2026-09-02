import { describe, expect, test } from 'bun:test';
import { invokeErrorMessage } from './invokeError';

describe('invokeErrorMessage', () => {
  test('returns a Tauri string rejection as-is', () => {
    expect(invokeErrorMessage('Connection not found')).toBe('Connection not found');
  });

  test('reads Error.message', () => {
    expect(invokeErrorMessage(new Error('pool exhausted'))).toBe('pool exhausted');
  });

  test('reads a message property on plain objects', () => {
    expect(invokeErrorMessage({ message: 'Not connected' })).toBe('Not connected');
  });

  test('falls back when the payload has no message', () => {
    expect(invokeErrorMessage(undefined)).toBe('Execution error');
    expect(invokeErrorMessage({ code: 1 })).toBe('Execution error');
    expect(invokeErrorMessage('')).toBe('Execution error');
    expect(invokeErrorMessage('', 'Failed to connect')).toBe('Failed to connect');
  });
});
