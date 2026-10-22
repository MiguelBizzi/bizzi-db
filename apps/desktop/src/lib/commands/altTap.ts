/** Detects a lone Alt press-and-release, which Windows apps use to focus the menu bar. */
export function createAltTapTracker(): {
  keyDown(key: string): void;
  keyUp(key: string): boolean;
  interrupt(): void;
} {
  let armed = false;
  let held = false;
  return {
    keyDown(key) {
      if (key !== 'Alt') {
        armed = false;
        return;
      }
      // Alt auto-repeats while held; only the initial press arms the tap.
      if (!held) armed = true;
      held = true;
    },
    keyUp(key) {
      if (key !== 'Alt') return false;
      const tap = armed;
      armed = false;
      held = false;
      return tap;
    },
    interrupt() {
      armed = false;
    },
  };
}
