import { describe, expect, test } from 'bun:test';
import {
  canConfirmInstall,
  downloadPercent,
  shouldStartInstall,
  statusAfterCheck,
  statusAfterCheckError,
  statusAfterDownloadEvent,
} from './appUpdate';

describe('statusAfterCheck', () => {
  test('maps a missing update to up to date', () => {
    expect(statusAfterCheck(null)).toEqual({ phase: 'upToDate' });
  });

  test('maps a remote update to available with notes', () => {
    expect(
      statusAfterCheck({ version: '0.2.0', body: 'Bug fixes\n' }),
    ).toEqual({
      phase: 'available',
      version: '0.2.0',
      notes: 'Bug fixes',
    });
  });

  test('treats a missing body as empty notes', () => {
    expect(statusAfterCheck({ version: '0.2.0' })).toEqual({
      phase: 'available',
      version: '0.2.0',
      notes: '',
    });
  });
});

describe('statusAfterCheckError', () => {
  test('swallows network errors on the passive path', () => {
    expect(statusAfterCheckError('passive', 'error sending request')).toBeNull();
    expect(statusAfterCheckError('passive', new Error('403 Forbidden'))).toBeNull();
  });

  test('surfaces the message on a manual check', () => {
    expect(statusAfterCheckError('manual', '403 Forbidden')).toEqual({
      phase: 'error',
      message: '403 Forbidden',
    });
  });
});

describe('download progress', () => {
  test('starts at zero with a known total', () => {
    expect(
      statusAfterDownloadEvent(
        { phase: 'available', version: '0.2.0', notes: '' },
        { event: 'Started', data: { contentLength: 1000 } },
      ),
    ).toEqual({ phase: 'downloading', received: 0, total: 1000 });
  });

  test('accumulates Progress chunks', () => {
    const started = statusAfterDownloadEvent(
      { phase: 'available', version: '0.2.0', notes: '' },
      { event: 'Started', data: { contentLength: 400 } },
    );
    expect(
      statusAfterDownloadEvent(started, {
        event: 'Progress',
        data: { chunkLength: 100 },
      }),
    ).toEqual({ phase: 'downloading', received: 100, total: 400 });
  });

  test('Finished means installing, not idle', () => {
    expect(
      statusAfterDownloadEvent(
        { phase: 'downloading', received: 400, total: 400 },
        { event: 'Finished' },
      ),
    ).toEqual({ phase: 'installing' });
  });

  test('percent is null when the total is unknown', () => {
    expect(downloadPercent(50, null)).toBeNull();
    expect(downloadPercent(50, 0)).toBeNull();
    expect(downloadPercent(50, 200)).toBe(25);
  });
});

describe('confirm-to-install', () => {
  const available = {
    phase: 'available' as const,
    version: '0.2.0',
    notes: '',
  };

  test('install is offered only while an update is available', () => {
    expect(canConfirmInstall(available)).toBe(true);
    expect(canConfirmInstall({ phase: 'idle' })).toBe(false);
    expect(canConfirmInstall({ phase: 'downloading', received: 1, total: 2 })).toBe(
      false,
    );
  });

  test('does not start install until the user confirms', () => {
    expect(shouldStartInstall(available, false)).toBe(false);
    expect(shouldStartInstall(available, true)).toBe(true);
    expect(shouldStartInstall({ phase: 'upToDate' }, true)).toBe(false);
  });
});
