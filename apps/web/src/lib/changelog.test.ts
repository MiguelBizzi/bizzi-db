import { describe, expect, test } from 'bun:test';
import {
  CHANGELOG,
  UPCOMING,
  compareVersions,
} from './changelog';
import { parseRelease } from './useLatestRelease';
import rootPackage from '../../../../package.json';

describe('changelog', () => {
  test('newest entry is the version this repo ships', () => {
    expect(CHANGELOG[0]?.version).toBe(rootPackage.version);
  });

  test('entries run newest to oldest without overlapping', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const newer = CHANGELOG[i - 1]!;
      const older = CHANGELOG[i]!;
      expect(compareVersions(newer.from ?? newer.version, older.version)).toBeGreaterThan(0);
      expect(newer.date >= older.date).toBe(true);
    }
  });

  test('every entry says something and uses a known kind', () => {
    for (const entry of CHANGELOG) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.changes.length).toBeGreaterThan(0);
      for (const change of entry.changes) {
        expect(['new', 'better', 'fixed']).toContain(change.kind);
      }
    }
  });

  test('unreleased notes, when present, are filled in', () => {
    if (!UPCOMING) return;
    expect(UPCOMING.title.length).toBeGreaterThan(0);
    expect(UPCOMING.changes.length).toBeGreaterThan(0);
  });
});

describe('compareVersions', () => {
  test('compares numerically, not as text', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.2', '0.1.16')).toBeLessThan(0);
    expect(compareVersions('0.1.16', '0.1.16')).toBe(0);
  });
});

describe('parseRelease', () => {
  test('reads the tag and date from a GitHub release', () => {
    expect(
      parseRelease({ tag_name: 'v0.1.17', published_at: '2026-10-15T10:00:00Z' }),
    ).toEqual({
      version: '0.1.17',
      publishedAt: '2026-10-15T10:00:00Z',
      live: true,
    });
  });

  test('rejects anything that is not a semver tag', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ message: 'rate limit exceeded' })).toBeNull();
    expect(parseRelease({ tag_name: 'nightly' })).toBeNull();
  });
});
