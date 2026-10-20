export type ChangeKind = 'new' | 'better' | 'fixed';

export type Change = {
  kind: ChangeKind;
  text: string;
};

export type ChangelogEntry = {
  /** Newest version this entry covers; the one shown on the timeline node. */
  version: string;
  /** Oldest version it covers, when a milestone spans several tags. */
  from?: string;
  /** ISO date of the newest tag. */
  date: string;
  /** How many tagged releases the entry covers. */
  releases: number;
  title: string;
  summary: string;
  changes: Change[];
};

/** Date of the v0.1.0 tag; the oldest entry's own date is that of its newest tag (v0.1.5). */
export const FIRST_RELEASE_DATE = '2026-10-02';

export type UpcomingEntry = Pick<ChangelogEntry, 'title' | 'summary' | 'changes'>;

// Generated from CHANGELOG.md at the repository root: edit that file, then run `bun run changelog:generate`.
// UPCOMING is its [Unreleased] section, shown as "Next release" above the timeline.
export { CHANGELOG, UPCOMING } from './changelog.data';

/** Negative when a < b, positive when a > b. Compares major.minor.patch numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
