import { describe, expect, test } from 'bun:test';
import {
  defaultSslForHost,
  isLoopbackHost,
  warnInsecureConnection,
} from './connectionSecurity';

describe('isLoopbackHost', () => {
  test('recognizes loopback addresses regardless of case or padding', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost(' localhost ')).toBe(true);
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  test('treats remote hosts as non-loopback', () => {
    expect(isLoopbackHost('db.example.com')).toBe(false);
    expect(isLoopbackHost('10.0.0.5')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });
});

describe('defaultSslForHost', () => {
  test('disables SSL on loopback and requires it for remote hosts', () => {
    expect(defaultSslForHost('127.0.0.1')).toBe('disabled');
    expect(defaultSslForHost('localhost')).toBe('disabled');
    expect(defaultSslForHost('db.example.com')).toBe('require');
    expect(defaultSslForHost('')).toBe('disabled');
  });
});

describe('warnInsecureConnection', () => {
  test('is silent when SSL is not disabled or the host is local', () => {
    expect(warnInsecureConnection('db.example.com', 'require')).toBeNull();
    expect(warnInsecureConnection('db.example.com', 'enabled')).toBeNull();
    expect(warnInsecureConnection('127.0.0.1', 'disabled')).toBeNull();
    expect(warnInsecureConnection('localhost', 'disabled', 'production')).toBeNull();
  });

  test('warns for remote hosts without SSL, stronger in production', () => {
    expect(warnInsecureConnection('db.example.com', 'disabled')).toContain(
      'Enable SSL',
    );
    expect(
      warnInsecureConnection('db.example.com', 'disabled', 'production'),
    ).toContain('Production');
  });
});
