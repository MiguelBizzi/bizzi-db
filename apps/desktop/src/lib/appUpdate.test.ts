import { describe, expect, test } from 'bun:test';
import {
  UPDATE_CHECK_INTERVAL_MS,
  canRestartToUpdate,
  manualCheckFeedback,
  downloadPercent,
  canStartUpdateCheck,
  shouldShowUpdateBanner,
  statusAfterCheck,
  statusAfterCheckError,
  statusAfterDownloadComplete,
  statusAfterDownloadEvent,
  statusAfterDownloadFailure,
  statusAfterInstallFailure,
  type AppUpdateStatus,
} from './appUpdate';

const available: AppUpdateStatus = {
  phase: 'available',
  version: '0.2.0',
  notes: 'Bug fixes',
};

describe('statusAfterCheck', () => {
  test('maps a missing update to up to date', () => {
    expect(statusAfterCheck(null)).toEqual({ phase: 'upToDate' });
  });

  test('maps a remote update to available with notes', () => {
    expect(
      statusAfterCheck({ version: '0.2.0', body: 'Bug fixes\n' }),
    ).toEqual(available);
  });

  test('treats a missing body as empty notes', () => {
    expect(statusAfterCheck({ version: '0.2.0' })).toEqual({
      phase: 'available',
      version: '0.2.0',
      notes: '',
    });
  });
});

describe('failures are never silent', () => {
  test('a failed check is reported with its stage', () => {
    expect(statusAfterCheckError(new Error('404 Not Found'))).toEqual({
      phase: 'error',
      stage: 'check',
      message: '404 Not Found',
    });
  });

  test('falls back to a readable message', () => {
    expect(statusAfterCheckError(undefined)).toEqual({
      phase: 'error',
      stage: 'check',
      message: 'Could not check for updates',
    });
  });

  test('a failed download is reported with its stage', () => {
    expect(statusAfterDownloadFailure('connection reset')).toEqual({
      phase: 'error',
      stage: 'download',
      message: 'connection reset',
    });
  });

  test('a failed install is reported with its stage', () => {
    expect(statusAfterInstallFailure(new Error('permission denied'))).toEqual({
      phase: 'error',
      stage: 'install',
      message: 'permission denied',
    });
  });
});

describe('background download', () => {
  test('starts at zero with a known total and keeps the version', () => {
    expect(
      statusAfterDownloadEvent(available, {
        event: 'Started',
        data: { contentLength: 1000 },
      }),
    ).toEqual({
      phase: 'downloading',
      version: '0.2.0',
      notes: 'Bug fixes',
      received: 0,
      total: 1000,
    });
  });

  test('accumulates Progress chunks', () => {
    const started = statusAfterDownloadEvent(available, {
      event: 'Started',
      data: { contentLength: 400 },
    });
    expect(
      statusAfterDownloadEvent(started, {
        event: 'Progress',
        data: { chunkLength: 100 },
      }),
    ).toMatchObject({ phase: 'downloading', received: 100, total: 400 });
  });

  test('Finished means ready to restart, not installing', () => {
    expect(
      statusAfterDownloadEvent(
        {
          phase: 'downloading',
          version: '0.2.0',
          notes: 'Bug fixes',
          received: 400,
          total: 400,
        },
        { event: 'Finished' },
      ),
    ).toEqual({ phase: 'ready', version: '0.2.0', notes: 'Bug fixes' });
  });

  test('ignores a stray Finished outside a download', () => {
    expect(
      statusAfterDownloadEvent({ phase: 'upToDate' }, { event: 'Finished' }),
    ).toEqual({ phase: 'upToDate' });
  });

  test('percent is null when the total is unknown', () => {
    expect(downloadPercent(50, null)).toBeNull();
    expect(downloadPercent(50, 0)).toBeNull();
    expect(downloadPercent(50, 200)).toBe(25);
  });
});

describe('download completion does not depend on progress events', () => {
  test('a resolved download is ready even if no event ever arrived', () => {
    expect(statusAfterDownloadComplete(available)).toEqual({
      phase: 'ready',
      version: '0.2.0',
      notes: 'Bug fixes',
    });
  });

  test('a resolved download after progress is ready', () => {
    expect(
      statusAfterDownloadComplete({
        phase: 'downloading',
        version: '0.2.0',
        notes: '',
        received: 5,
        total: 10,
      }),
    ).toEqual({ phase: 'ready', version: '0.2.0', notes: '' });
  });

  test('leaves unrelated states alone', () => {
    expect(statusAfterDownloadComplete({ phase: 'upToDate' })).toEqual({
      phase: 'upToDate',
    });
  });
});

describe('restart to update', () => {
  test('restart is offered only once the update is downloaded', () => {
    expect(
      canRestartToUpdate({ phase: 'ready', version: '0.2.0', notes: '' }),
    ).toBe(true);
    expect(canRestartToUpdate(available)).toBe(false);
    expect(canRestartToUpdate({ phase: 'idle' })).toBe(false);
    expect(canRestartToUpdate({ phase: 'installing' })).toBe(false);
  });
});

describe('starting a check', () => {
  test('checks every six hours', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  test('never disturbs an update that is already in flight', () => {
    expect(canStartUpdateCheck({ phase: 'checking' })).toBe(false);
    expect(canStartUpdateCheck(available)).toBe(false);
    expect(
      canStartUpdateCheck({
        phase: 'downloading',
        version: '0.2.0',
        notes: '',
        received: 0,
        total: null,
      }),
    ).toBe(false);
    expect(
      canStartUpdateCheck({ phase: 'ready', version: '0.2.0', notes: '' }),
    ).toBe(false);
    expect(canStartUpdateCheck({ phase: 'installing' })).toBe(false);
  });

  test('re-checks when idle, current, or after a failure', () => {
    expect(canStartUpdateCheck({ phase: 'idle' })).toBe(true);
    expect(canStartUpdateCheck({ phase: 'upToDate' })).toBe(true);
    expect(
      canStartUpdateCheck({ phase: 'error', stage: 'check', message: 'x' }),
    ).toBe(true);
    expect(
      canStartUpdateCheck({ phase: 'error', stage: 'download', message: 'x' }),
    ).toBe(true);
  });
});

describe('update banner', () => {
  const ready: AppUpdateStatus = {
    phase: 'ready',
    version: '0.2.0',
    notes: '',
  };

  test('shows when an update is ready to install', () => {
    expect(shouldShowUpdateBanner(ready, null)).toBe(true);
  });

  test('stays hidden after Later for that version only', () => {
    expect(shouldShowUpdateBanner(ready, '0.2.0')).toBe(false);
    expect(shouldShowUpdateBanner(ready, '0.1.9')).toBe(true);
  });

  test('surfaces download and install failures', () => {
    expect(
      shouldShowUpdateBanner(
        { phase: 'error', stage: 'download', message: 'x' },
        null,
      ),
    ).toBe(true);
    expect(
      shouldShowUpdateBanner(
        { phase: 'error', stage: 'install', message: 'x' },
        null,
      ),
    ).toBe(true);
  });

  test('keeps routine checking and downloading quiet', () => {
    expect(shouldShowUpdateBanner({ phase: 'checking' }, null)).toBe(false);
    expect(shouldShowUpdateBanner(available, null)).toBe(false);
    expect(shouldShowUpdateBanner({ phase: 'upToDate' }, null)).toBe(false);
    expect(
      shouldShowUpdateBanner(
        { phase: 'error', stage: 'check', message: 'offline' },
        null,
      ),
    ).toBe(false);
  });
});

describe('manualCheckFeedback', () => {
  test('confirms when the app is already current', () => {
    expect(manualCheckFeedback({ phase: 'upToDate' }, '0.1.8')).toEqual({
      message: "You're on the latest version (0.1.8)",
      kind: 'success',
    });
  });

  test('reports a failed check', () => {
    expect(
      manualCheckFeedback(
        { phase: 'error', stage: 'check', message: 'offline' },
        '0.1.8',
      ),
    ).toEqual({ message: "Couldn't check for updates: offline", kind: 'error' });
  });

  test('stays quiet when the banner or settings already show progress', () => {
    expect(manualCheckFeedback(available, '0.1.8')).toBeNull();
    expect(
      manualCheckFeedback({ phase: 'ready', version: '0.2.0', notes: '' }, '0.1.8'),
    ).toBeNull();
  });
});
