import type { UpdateChannel } from '@db/core';
import { invokeErrorMessage } from './invokeError';

export type UpdateErrorStage = 'check' | 'download' | 'install';

export type AppUpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'available'; version: string; notes: string }
  | {
      phase: 'downloading';
      version: string;
      notes: string;
      received: number;
      total: number | null;
    }
  | { phase: 'ready'; version: string; notes: string }
  | { phase: 'installing' }
  | { phase: 'error'; stage: UpdateErrorStage; message: string };

export const IDLE_UPDATE_STATUS: AppUpdateStatus = { phase: 'idle' };

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type RemoteUpdate = {
  version: string;
  body?: string | null;
};

export type DownloadProgressEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export function statusAfterCheck(update: RemoteUpdate | null): AppUpdateStatus {
  if (!update) return { phase: 'upToDate' };
  return {
    phase: 'available',
    version: update.version,
    notes: (update.body ?? '').trim(),
  };
}

function failure(
  stage: UpdateErrorStage,
  error: unknown,
  fallback: string,
): AppUpdateStatus {
  return { phase: 'error', stage, message: invokeErrorMessage(error, fallback) };
}

export function statusAfterCheckError(error: unknown): AppUpdateStatus {
  return failure('check', error, 'Could not check for updates');
}

export function statusAfterDownloadFailure(error: unknown): AppUpdateStatus {
  return failure('download', error, 'Could not download the update');
}

export function statusAfterInstallFailure(error: unknown): AppUpdateStatus {
  return failure('install', error, 'Could not install the update');
}

export function statusAfterDownloadEvent(
  current: AppUpdateStatus,
  event: DownloadProgressEvent,
): AppUpdateStatus {
  if (event.event === 'Started') {
    if (current.phase !== 'available' && current.phase !== 'downloading') {
      return current;
    }
    return {
      phase: 'downloading',
      version: current.version,
      notes: current.notes,
      received: 0,
      total: event.data.contentLength ?? null,
    };
  }
  if (current.phase !== 'downloading') return current;
  if (event.event === 'Progress') {
    return {
      ...current,
      received: current.received + event.data.chunkLength,
    };
  }
  return { phase: 'ready', version: current.version, notes: current.notes };
}

/**
 * The resolved download promise is the source of truth. Progress events are
 * cosmetic: they can be lost, so they must never gate the ready state.
 */
export function statusAfterDownloadComplete(
  current: AppUpdateStatus,
): AppUpdateStatus {
  if (current.phase !== 'available' && current.phase !== 'downloading') {
    return current;
  }
  return { phase: 'ready', version: current.version, notes: current.notes };
}

export function downloadPercent(
  received: number,
  total: number | null,
): number | null {
  if (total == null || total <= 0) return null;
  return Math.min(100, Math.round((received / total) * 100));
}

export function canRestartToUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'ready';
}

/** Neither a background nor a manual check may interrupt an update that is already moving. */
export function canStartUpdateCheck(status: AppUpdateStatus): boolean {
  switch (status.phase) {
    case 'idle':
    case 'upToDate':
    case 'error':
      return true;
    default:
      return false;
  }
}

/**
 * The banner is for things the user can act on: an update ready to install,
 * or a download/install that failed. Offline check failures stay in Settings.
 */
export function shouldShowUpdateBanner(
  status: AppUpdateStatus,
  dismissedVersion: string | null,
): boolean {
  if (status.phase === 'ready') return status.version !== dismissedVersion;
  return (
    status.phase === 'error' &&
    (status.stage === 'download' || status.stage === 'install')
  );
}

/** A manual check must always answer, even when nothing changed. */
export function manualCheckFeedback(
  status: AppUpdateStatus,
  currentVersion: string,
): { message: string; kind: 'success' | 'error' } | null {
  if (status.phase === 'upToDate') {
    return {
      message: `You're on the latest version (${currentVersion})`,
      kind: 'success',
    };
  }
  if (status.phase === 'error' && status.stage === 'check') {
    return {
      message: `Couldn't check for updates: ${status.message}`,
      kind: 'error',
    };
  }
  return null;
}

export const SELF_UPDATE_UNSUPPORTED_MESSAGE =
  'This copy of Bizzi DB was not installed from the AppImage or the .deb package, so it cannot update itself. Download the latest version from the releases page.';

export function checkOptions(channel: UpdateChannel): { target: string } | undefined {
  return channel.target ? { target: channel.target } : undefined;
}

export function canAutoCheck(channel: UpdateChannel): boolean {
  return channel.selfUpdate;
}

export function manualCheckBlocked(
  channel: UpdateChannel,
): { message: string; kind: 'error' } | null {
  if (channel.selfUpdate) return null;
  return { message: SELF_UPDATE_UNSUPPORTED_MESSAGE, kind: 'error' };
}
