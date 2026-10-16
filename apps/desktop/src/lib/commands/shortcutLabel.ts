import { formatAccelerator, type Platform } from './accelerator';
import { commandById } from './registry';

/** Detect the host platform from the user agent; non-browser runtimes (bun test) default to macOS. */
export function currentPlatform(): Platform {
  const ua = typeof navigator === 'undefined' ? undefined : navigator.userAgent;
  // Bun and Node expose a `navigator` whose userAgent is the runtime name, not a browser.
  if (!ua || ua.startsWith('Bun/') || ua.startsWith('Node.js/')) return 'macos';
  if (ua.includes('Mac')) return 'macos';
  if (ua.includes('Win')) return 'windows';
  return 'linux';
}

/** Display string for a command's accelerator, or `''` when it has none. */
export function shortcutLabel(id: string, platform: Platform = currentPlatform()): string {
  const accelerator = commandById(id).accelerator;
  return accelerator ? formatAccelerator(accelerator, platform) : '';
}
