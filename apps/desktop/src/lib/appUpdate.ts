import { invokeErrorMessage } from './invokeError';

export type UpdateCheckKind = 'passive' | 'manual';

export type AppUpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'available'; version: string; notes: string }
  | { phase: 'downloading'; received: number; total: number | null }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

export const IDLE_UPDATE_STATUS: AppUpdateStatus = { phase: 'idle' };

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

export function statusAfterCheckError(
  kind: UpdateCheckKind,
  error: unknown,
): AppUpdateStatus | null {
  if (kind === 'passive') return null;
  return {
    phase: 'error',
    message: invokeErrorMessage(error, 'Could not check for updates'),
  };
}

export function statusAfterDownloadEvent(
  current: AppUpdateStatus,
  event: DownloadProgressEvent,
): AppUpdateStatus {
  if (event.event === 'Started') {
    return {
      phase: 'downloading',
      received: 0,
      total: event.data.contentLength ?? null,
    };
  }
  if (event.event === 'Progress') {
    const received =
      (current.phase === 'downloading' ? current.received : 0) +
      event.data.chunkLength;
    const total = current.phase === 'downloading' ? current.total : null;
    return { phase: 'downloading', received, total };
  }
  return { phase: 'installing' };
}

export function downloadPercent(
  received: number,
  total: number | null,
): number | null {
  if (total == null || total <= 0) return null;
  return Math.min(100, Math.round((received / total) * 100));
}

export function canConfirmInstall(status: AppUpdateStatus): boolean {
  return status.phase === 'available';
}

export function shouldStartInstall(
  status: AppUpdateStatus,
  userConfirmed: boolean,
): boolean {
  return userConfirmed && status.phase === 'available';
}
