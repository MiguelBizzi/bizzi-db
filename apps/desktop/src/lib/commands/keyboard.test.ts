import { describe, expect, it, vi } from 'vitest';
import {
  acceleratorFromEvent,
  decideKeydown,
  isNavigationMouseButton,
  SUPPRESSED_BROWSER_KEYS, type KeyEventLike,
} from './keyboard';

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('acceleratorFromEvent', () => {
  it('maps Ctrl+Shift+N on Windows', () => {
    expect(acceleratorFromEvent(ev({ key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true }), 'windows')).toBe(
      'CmdOrCtrl+Shift+N',
    );
  });

  it('maps Cmd on macOS and ignores Ctrl as Cmd', () => {
    expect(acceleratorFromEvent(ev({ key: 'k', code: 'KeyK', metaKey: true }), 'macos')).toBe('CmdOrCtrl+K');
    expect(acceleratorFromEvent(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), 'macos')).toBe('Ctrl+K');
  });

  it('shifted punctuation uses the physical key', () => {
    expect(
      acceleratorFromEvent(ev({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true }), 'windows'),
    ).toBe('CmdOrCtrl+Shift+]');
  });

  it('uses the physical key when the layout is not Latin', () => {
    expect(acceleratorFromEvent(ev({ key: 'л', code: 'KeyK', ctrlKey: true }), 'windows')).toBe('CmdOrCtrl+K');
  });

  it('AltGr characters are not shortcuts', () => {
    expect(acceleratorFromEvent(ev({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true }), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev({ key: 'v', code: 'KeyV', ctrlKey: true, altKey: true }), 'windows')).toBe(
      'CmdOrCtrl+Alt+V',
    );
  });

  it('Windows key and bare modifiers are ignored', () => {
    expect(acceleratorFromEvent(ev({ key: 'k', code: 'KeyK', metaKey: true }), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), 'windows')).toBeNull();
  });

  it('Ctrl+Alt+Space is a shortcut', () => {
    expect(acceleratorFromEvent(ev({ key: ' ', code: 'Space', ctrlKey: true, altKey: true }), 'windows')).toBe(
      'CmdOrCtrl+Alt+SPACE',
    );
  });

  it('AltGr digit characters are not shortcuts', () => {
    expect(acceleratorFromEvent(ev({ key: '{', code: 'Digit7', ctrlKey: true, altKey: true }), 'windows')).toBeNull();
  });

  it('function and named keys', () => {
    expect(acceleratorFromEvent(ev({ key: 'F5', code: 'F5' }), 'windows')).toBe('F5');
    expect(acceleratorFromEvent(ev({ key: 'Delete', code: 'Delete' }), 'windows')).toBe('DELETE');
    expect(acceleratorFromEvent(ev({ key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true }), 'windows')).toBe(
      'CmdOrCtrl+Shift+TAB',
    );
    expect(acceleratorFromEvent(ev({ key: 'Enter', code: 'NumpadEnter', ctrlKey: true }), 'windows')).toBe(
      'CmdOrCtrl+ENTER',
    );
  });

  it('browser hardware keys produce their normalized forms', () => {
    expect(acceleratorFromEvent(ev({ key: 'BrowserBack', code: 'BrowserBack' }), 'windows')).toBe('BROWSERBACK');
    expect(acceleratorFromEvent(ev({ key: 'BrowserForward', code: 'BrowserForward' }), 'windows')).toBe(
      'BROWSERFORWARD',
    );
    expect(acceleratorFromEvent(ev({ key: 'BrowserRefresh', code: 'BrowserRefresh' }), 'windows')).toBe(
      'BROWSERREFRESH',
    );
    expect(acceleratorFromEvent(ev({ key: 'F5', code: 'F5', shiftKey: true }), 'windows')).toBe('Shift+F5');
  });

  it('a "+" key is never a shortcut and does not throw', () => {
    expect(acceleratorFromEvent(ev({ key: '+', code: 'NumpadAdd', ctrlKey: true }), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev({ key: '+', code: 'NumpadAdd' }), 'windows')).toBeNull();
    expect(decideKeydown(ev({ key: '+', code: 'NumpadAdd', ctrlKey: true }), 'windows', () => true)).toBe('pass');
  });
});

describe('decideKeydown', () => {
  it('runs the command', () => {
    const run = vi.fn(() => true);
    expect(decideKeydown(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), 'windows', run)).toBe('ran');
    expect(run).toHaveBeenCalledWith('view.palette');
  });

  it('passes a key whose command did not run', () => {
    expect(decideKeydown(ev({ key: 'Delete', code: 'Delete' }), 'windows', () => false)).toBe('pass');
  });

  it('suppresses browser reload when no command runs', () => {
    const run = () => false;
    expect(decideKeydown(ev({ key: 'F5', code: 'F5' }), 'windows', run)).toBe('suppressed');
    expect(decideKeydown(ev({ key: 'r', code: 'KeyR', ctrlKey: true }), 'windows', run)).toBe('suppressed');
    expect(decideKeydown(ev({ key: 'p', code: 'KeyP', ctrlKey: true }), 'windows', run)).toBe('suppressed');
    expect(decideKeydown(ev({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }), 'windows', run)).toBe(
      'suppressed',
    );
  });

  it('suppresses Shift+F5 and the browser hardware keys', () => {
    const run = () => false;
    expect(decideKeydown(ev({ key: 'F5', code: 'F5', shiftKey: true }), 'windows', run)).toBe('suppressed');
    for (const key of ['BrowserRefresh', 'BrowserBack', 'BrowserForward']) {
      expect(decideKeydown(ev({ key, code: key }), 'windows', run)).toBe('suppressed');
    }
  });

  it('passes while composing', () => {
    const run = vi.fn(() => true);
    expect(decideKeydown(ev({ key: 'k', code: 'KeyK', ctrlKey: true, isComposing: true }), 'windows', run)).toBe('pass');
    expect(run).not.toHaveBeenCalled();
  });

  it('respects editor handling', () => {
    const run = vi.fn(() => true);
    expect(decideKeydown(ev({ key: 'f', code: 'KeyF', ctrlKey: true, defaultPrevented: true }), 'windows', run)).toBe(
      'pass',
    );
    expect(run).not.toHaveBeenCalled();
  });
});

describe('SUPPRESSED_BROWSER_KEYS', () => {
  it('pins the suppressed list', () => {
    expect([...SUPPRESSED_BROWSER_KEYS].sort()).toEqual(
      [
        'F3',
        'F5',
        'Shift+F5',
        'CmdOrCtrl+F5',
        'CmdOrCtrl+R',
        'CmdOrCtrl+Shift+R',
        'CmdOrCtrl+P',
        'CmdOrCtrl+F',
        'CmdOrCtrl+G',
        'CmdOrCtrl+Shift+G',
        'CmdOrCtrl+U',
        'CmdOrCtrl+J',
        'CmdOrCtrl+=',
        'CmdOrCtrl+-',
        'CmdOrCtrl+0',
        'Alt+ARROWLEFT',
        'Alt+ARROWRIGHT',
        'BROWSERREFRESH',
        'BROWSERBACK',
        'BROWSERFORWARD',
      ].sort(),
    );
  });
});

describe('isNavigationMouseButton', () => {
  it('flags back and forward buttons', () => {
    expect(isNavigationMouseButton(3)).toBe(true);
    expect(isNavigationMouseButton(4)).toBe(true);
    for (const b of [0, 1, 2]) expect(isNavigationMouseButton(b)).toBe(false);
  });
});
