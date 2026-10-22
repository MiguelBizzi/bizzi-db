import type { Platform } from './commands/accelerator';

export type CaptionAction = 'minimize' | 'maximize' | 'restore' | 'close';

export function captionButtons(maximized: boolean): { action: CaptionAction; label: string }[] {
  return [
    { action: 'minimize', label: 'Minimize' },
    maximized
      ? { action: 'restore', label: 'Restore Down' }
      : { action: 'maximize', label: 'Maximize' },
    { action: 'close', label: 'Close' },
  ];
}

/** macOS reserves the left edge for traffic lights; Windows caption buttons sit flush against the right edge. */
export function navbarPadding(platform: Platform): string {
  return platform === 'windows' ? 'pl-4 pr-0' : 'pl-24 pr-4';
}
