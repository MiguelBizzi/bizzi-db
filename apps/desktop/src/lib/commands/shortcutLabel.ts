import { formatAccelerator, type Platform } from './accelerator';
import { acceleratorFor, commandById } from './registry';

declare global {
  var __BIZZI_PLATFORM__: string | undefined;
}

const PLATFORMS: readonly string[] = ['macos', 'windows', 'linux'];

/** Host platform: injected by Rust, else the user agent; non-browser runtimes (bun test) default to macOS. */
export function currentPlatform(): Platform {
  // WebKitGTK's user agent cannot be trusted to name Linux, so Rust injects the platform.
  const injected = globalThis.__BIZZI_PLATFORM__;
  if (injected && PLATFORMS.includes(injected)) return injected as Platform;
  const ua = typeof navigator === 'undefined' ? undefined : navigator.userAgent;
  // Bun and Node expose a `navigator` whose userAgent is the runtime name, not a browser.
  if (!ua || ua.startsWith('Bun/') || ua.startsWith('Node.js/')) return 'macos';
  if (ua.includes('Mac')) return 'macos';
  if (ua.includes('Win')) return 'windows';
  return 'linux';
}

/** Display string for a command's accelerator, or `''` when it has none. */
export function shortcutLabel(id: string, platform: Platform = currentPlatform()): string {
  const accelerator = acceleratorFor(commandById(id), platform);
  return accelerator ? formatAccelerator(accelerator, platform) : '';
}
