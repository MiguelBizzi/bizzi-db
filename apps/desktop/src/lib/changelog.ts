// Same shape as apps/web/src/lib/changelog.ts: both read data generated from CHANGELOG.md by
// `bun run changelog:generate`, which writes changelog.data.ts next to each.
export type ChangeKind = 'new' | 'better' | 'fixed';

export type Change = {
  kind: ChangeKind;
  text: string;
};

export type ChangelogEntry = {
  /** Newest version this entry covers. */
  version: string;
  /** Oldest version it covers, when a milestone spans several tags. */
  from?: string;
  /** ISO date of the newest tag. */
  date: string;
  releases: number;
  title: string;
  summary: string;
  changes: Change[];
};

export type UpcomingEntry = Pick<ChangelogEntry, 'title' | 'summary' | 'changes'>;
