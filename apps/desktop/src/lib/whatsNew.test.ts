import { describe, expect, test } from 'bun:test';
import type { ChangelogEntry } from './changelog';
import {
  LAST_SEEN_VERSION_KEY,
  activeReleaseIndex,
  followScroll,
  countChanges,
  decideWhatsNew,
  entriesForManualOpen,
  loadLastSeenVersion,
  releaseHistory,
  releasesBetween,
  saveLastSeenVersion,
  splitInlineCode,
} from './whatsNew';

const entry = (version: string, extra: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  version,
  date: '2026-10-01',
  releases: 1,
  title: `Release ${version}`,
  summary: '',
  changes: [{ kind: 'fixed', text: `fix in ${version}` }],
  ...extra,
});

const LOG: ChangelogEntry[] = [
  entry('0.1.24'),
  entry('0.1.23'),
  entry('0.1.22'),
  entry('0.1.21'),
  entry('0.1.20'),
  entry('0.1.10', { from: '0.1.6', releases: 5 }),
  entry('0.1.5'),
];

const versions = (entries: ChangelogEntry[]) => entries.map((e) => e.version);

describe('releasesBetween', () => {
  test('lists every release after the previous one up to the current, newest first', () => {
    expect(versions(releasesBetween(LOG, '0.1.20', '0.1.24'))).toEqual([
      '0.1.24',
      '0.1.23',
      '0.1.22',
      '0.1.21',
    ]);
  });

  test('one version behind shows only the current release', () => {
    expect(versions(releasesBetween(LOG, '0.1.23', '0.1.24'))).toEqual(['0.1.24']);
  });

  test('never shows a release newer than the one running', () => {
    expect(versions(releasesBetween(LOG, '0.1.21', '0.1.23'))).toEqual(['0.1.23', '0.1.22']);
  });

  test('includes a milestone the previous version sat inside', () => {
    expect(versions(releasesBetween(LOG, '0.1.7', '0.1.20'))).toEqual(['0.1.20', '0.1.10']);
  });

  test('compares numerically, not as text', () => {
    expect(versions(releasesBetween(LOG, '0.1.9', '0.1.10'))).toEqual(['0.1.10']);
  });
});

describe('decideWhatsNew', () => {
  test('after an update, shows what changed since the last version seen', () => {
    expect(
      decideWhatsNew({ lastSeen: '0.1.20', current: '0.1.24', hasExistingWorkspace: true }),
    ).toEqual({ show: true, since: '0.1.20', record: '0.1.24' });
  });

  test('the same version again shows nothing', () => {
    expect(
      decideWhatsNew({ lastSeen: '0.1.24', current: '0.1.24', hasExistingWorkspace: true }),
    ).toEqual({ show: false, record: null });
  });

  test('a downgrade shows nothing and keeps the newer version seen', () => {
    expect(
      decideWhatsNew({ lastSeen: '0.1.24', current: '0.1.22', hasExistingWorkspace: true }),
    ).toEqual({ show: false, record: null });
  });

  test('a fresh install records the version without showing anything', () => {
    expect(
      decideWhatsNew({ lastSeen: null, current: '0.1.24', hasExistingWorkspace: false }),
    ).toEqual({ show: false, record: '0.1.24' });
  });

  test('an existing user with no record yet (updated from before this feature) sees the current release', () => {
    expect(
      decideWhatsNew({ lastSeen: null, current: '0.1.24', hasExistingWorkspace: true }),
    ).toEqual({ show: true, since: null, record: '0.1.24' });
  });

  test('ignores a stored value that is not a version', () => {
    expect(
      decideWhatsNew({ lastSeen: 'garbage', current: '0.1.24', hasExistingWorkspace: false }),
    ).toEqual({ show: false, record: '0.1.24' });
  });

  test('does nothing when the running version is unknown', () => {
    expect(
      decideWhatsNew({ lastSeen: '0.1.20', current: 'dev', hasExistingWorkspace: true }),
    ).toEqual({ show: false, record: null });
  });
});

describe('entriesForManualOpen', () => {
  test('shows the release that is running', () => {
    expect(versions(entriesForManualOpen(LOG, '0.1.22'))).toEqual(['0.1.22']);
  });

  test('a version inside a milestone shows that milestone', () => {
    expect(versions(entriesForManualOpen(LOG, '0.1.8'))).toEqual(['0.1.10']);
  });

  test('falls back to the newest release when the version is unknown or unreleased', () => {
    expect(versions(entriesForManualOpen(LOG, null))).toEqual(['0.1.24']);
    expect(versions(entriesForManualOpen(LOG, '0.1.30'))).toEqual(['0.1.24']);
  });
});

describe('releaseHistory', () => {
  test('lists every release up to the one running, newest first', () => {
    expect(versions(releaseHistory(LOG, '0.1.22'))).toEqual([
      '0.1.22',
      '0.1.21',
      '0.1.20',
      '0.1.10',
      '0.1.5',
    ]);
  });

  test('keeps a milestone the running version sits inside', () => {
    expect(versions(releaseHistory(LOG, '0.1.8'))).toEqual(['0.1.10', '0.1.5']);
  });

  test('lists everything when the version is unknown or newer than the log', () => {
    expect(releaseHistory(LOG, null)).toHaveLength(LOG.length);
    expect(releaseHistory(LOG, '0.1.30')).toHaveLength(LOG.length);
  });
});

describe('countChanges', () => {
  test('totals each kind across releases', () => {
    expect(
      countChanges([
        entry('0.1.2', {
          changes: [
            { kind: 'new', text: 'a' },
            { kind: 'fixed', text: 'b' },
          ],
        }),
        entry('0.1.1', {
          changes: [
            { kind: 'new', text: 'c' },
            { kind: 'better', text: 'd' },
          ],
        }),
      ]),
    ).toEqual({ new: 2, better: 1, fixed: 1 });
  });
});

describe('last seen version storage', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  };

  test('round-trips through storage', () => {
    const storage = memory();
    expect(loadLastSeenVersion(storage)).toBeNull();
    saveLastSeenVersion('0.1.24', storage);
    expect(storage.map.get(LAST_SEEN_VERSION_KEY)).toBe('0.1.24');
    expect(loadLastSeenVersion(storage)).toBe('0.1.24');
  });

  test('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadLastSeenVersion(broken)).toBeNull();
    expect(() => saveLastSeenVersion('0.1.24', broken)).not.toThrow();
  });
});

describe('splitInlineCode', () => {
  test('separates backtick spans from prose', () => {
    expect(splitInlineCode('Paste a `sqlserver://` or `mssql://` address')).toEqual([
      { code: false, text: 'Paste a ' },
      { code: true, text: 'sqlserver://' },
      { code: false, text: ' or ' },
      { code: true, text: 'mssql://' },
      { code: false, text: ' address' },
    ]);
  });

  test('leaves an unmatched backtick as text', () => {
    expect(splitInlineCode('a ` b')).toEqual([{ code: false, text: 'a ` b' }]);
  });
});

describe('activeReleaseIndex', () => {
  const tops = [0, 400, 900, 1300];

  test('the first release is active at the top', () => {
    expect(activeReleaseIndex(tops, 0)).toBe(0);
  });

  test('a release becomes active once its top reaches the reading line', () => {
    expect(activeReleaseIndex(tops, 330)).toBe(0);
    expect(activeReleaseIndex(tops, 340)).toBe(1);
    expect(activeReleaseIndex(tops, 1000)).toBe(2);
  });

  test('the last release is active when scrolled to the bottom, even if short', () => {
    expect(activeReleaseIndex(tops, 1000, { atBottom: true })).toBe(3);
  });

  test('no releases gives no index', () => {
    expect(activeReleaseIndex([], 0)).toBe(-1);
  });
});

describe('followScroll', () => {
  const tops = [0, 400, 900, 1300, 1800];

  test('while jumping to a release, passing the ones in between does not move the highlight', () => {
    const jump = { active: 3, target: 3 };
    for (const scrollTop of [100, 450, 950]) {
      expect(followScroll(jump, tops, scrollTop, { targetTop: 1300 - 24 })).toEqual(jump);
    }
  });

  test('the jump ends when the release is reached, then scrolling moves the highlight again', () => {
    const landed = followScroll({ active: 3, target: 3 }, tops, 1276, { targetTop: 1276 });
    expect(landed).toEqual({ active: 3, target: null });
    expect(followScroll(landed, tops, 1800, {})).toEqual({ active: 4, target: null });
  });

  test('a jump that cannot reach its release because the list ends there still ends', () => {
    expect(
      followScroll({ active: 4, target: 4 }, tops, 1500, { targetTop: 1776, atBottom: true }),
    ).toEqual({ active: 4, target: null });
  });

  test('without a jump it follows the reading position', () => {
    expect(followScroll({ active: 0, target: null }, tops, 450, {})).toEqual({
      active: 1,
      target: null,
    });
  });
});
