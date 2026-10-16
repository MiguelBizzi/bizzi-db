import { describe, expect, test } from 'bun:test';
import {
  formatAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  toTauriAccelerator,
} from './accelerator';
import { RESERVED_ACCELERATORS } from './reserved';

describe('parseAccelerator', () => {
  test('parses modifiers and key', () => {
    expect(parseAccelerator('CmdOrCtrl+Shift+N')).toEqual({
      cmd: true,
      shift: true,
      alt: false,
      ctrl: false,
      key: 'N',
    });
  });

  test('treats Ctrl as a literal control key and Cmd like CmdOrCtrl', () => {
    expect(parseAccelerator('Ctrl+CmdOrCtrl+F')).toEqual({
      cmd: true,
      shift: false,
      alt: false,
      ctrl: true,
      key: 'F',
    });
    expect(parseAccelerator('Cmd+K').cmd).toBe(true);
  });

  test('Alt and Option are the same modifier', () => {
    expect(parseAccelerator('Option+A').alt).toBe(true);
    expect(parseAccelerator('Alt+A').alt).toBe(true);
  });

  test('throws on unknown modifier', () => {
    expect(() => parseAccelerator('Hyper+N')).toThrow();
  });

  test('throws on empty key', () => {
    expect(() => parseAccelerator('CmdOrCtrl+')).toThrow();
    expect(() => parseAccelerator('')).toThrow();
  });

  test('throws when the key is only a modifier', () => {
    expect(() => parseAccelerator('CmdOrCtrl+Shift')).toThrow();
  });
});

describe('normalizeAccelerator', () => {
  test('is order and case insensitive', () => {
    expect(normalizeAccelerator('Shift+CmdOrCtrl+n')).toBe(normalizeAccelerator('CmdOrCtrl+Shift+N'));
  });

  test('uses canonical Ctrl+CmdOrCtrl+Alt+Shift+KEY order', () => {
    expect(normalizeAccelerator('Shift+Alt+CmdOrCtrl+Ctrl+f')).toBe('Ctrl+CmdOrCtrl+Alt+Shift+F');
    expect(normalizeAccelerator('Option+Cmd+w')).toBe('CmdOrCtrl+Alt+W');
  });
});

describe('formatAccelerator', () => {
  test('macOS glyphs in ⌃⌥⇧⌘ order', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+N', 'macos')).toBe('⇧⌘N');
    expect(formatAccelerator('CmdOrCtrl+Alt+W', 'macos')).toBe('⌥⌘W');
    expect(formatAccelerator('Ctrl+CmdOrCtrl+F', 'macos')).toBe('⌃⌘F');
    expect(formatAccelerator('CmdOrCtrl+Shift+Enter', 'macos')).toBe('⇧⌘↵');
    expect(formatAccelerator('CmdOrCtrl+Backspace', 'macos')).toBe('⌘⌫');
  });

  test('Windows and Linux use Ctrl+Shift+N style', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+N', 'windows')).toBe('Ctrl+Shift+N');
    expect(formatAccelerator('CmdOrCtrl+Alt+W', 'linux')).toBe('Ctrl+Alt+W');
  });

  test('named keys display in natural case on Windows and Linux', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+Enter', 'windows')).toBe('Ctrl+Shift+Enter');
    expect(formatAccelerator('CmdOrCtrl+Backspace', 'windows')).toBe('Ctrl+Backspace');
    expect(formatAccelerator('CmdOrCtrl+ArrowUp', 'linux')).toBe('Ctrl+ArrowUp');
    expect(formatAccelerator('CmdOrCtrl+enter', 'linux')).toBe('Ctrl+Enter');
  });

  test('named keys without a glyph display in natural case on macOS', () => {
    expect(formatAccelerator('CmdOrCtrl+Escape', 'macos')).toBe('⌘Escape');
    expect(formatAccelerator('CmdOrCtrl+Alt+ArrowUp', 'macos')).toBe('⌥⌘ArrowUp');
    expect(formatAccelerator('CmdOrCtrl+Space', 'macos')).toBe('⌘Space');
    expect(formatAccelerator('CmdOrCtrl+Tab', 'macos')).toBe('⌘Tab');
  });

  test('single-character and function keys are uppercased', () => {
    expect(formatAccelerator('CmdOrCtrl+,', 'windows')).toBe('Ctrl+,');
    expect(formatAccelerator('CmdOrCtrl+/', 'macos')).toBe('⌘/');
    expect(formatAccelerator('CmdOrCtrl+f5', 'windows')).toBe('Ctrl+F5');
  });

  test('normalize keeps the uppercased canonical key for named keys', () => {
    expect(normalizeAccelerator('CmdOrCtrl+Shift+Enter')).toBe('CmdOrCtrl+Shift+ENTER');
  });
});

describe('toTauriAccelerator', () => {
  test('returns the validated string unchanged', () => {
    expect(toTauriAccelerator('CmdOrCtrl+Shift+N')).toBe('CmdOrCtrl+Shift+N');
  });

  test('throws on invalid input', () => {
    expect(() => toTauriAccelerator('Hyper+N')).toThrow();
  });
});

describe('RESERVED_ACCELERATORS', () => {
  test('every entry parses', () => {
    for (const acc of RESERVED_ACCELERATORS) {
      expect(() => parseAccelerator(acc)).not.toThrow();
    }
  });

  test('contains the expected entries', () => {
    expect(RESERVED_ACCELERATORS).toContain('CmdOrCtrl+Q');
    expect(RESERVED_ACCELERATORS).toContain('CmdOrCtrl+`');
    expect(RESERVED_ACCELERATORS).toContain('Ctrl+CmdOrCtrl+F');
    expect(RESERVED_ACCELERATORS.length).toBe(13);
  });
});
