import type { ChangeKind, ChangelogEntry } from './changelog';

export const LAST_SEEN_VERSION_KEY = 'bizzi.lastSeenVersion';

const VERSION = /^\d+\.\d+\.\d+$/;

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

/** Negative when a < b, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Entries released after `previous` up to and including `current`, newest first. A milestone that
 * spans several tags counts when its newest tag is in that range, even if `previous` sat inside it.
 */
export function releasesBetween(
  entries: readonly ChangelogEntry[],
  previous: string,
  current: string,
): ChangelogEntry[] {
  return entries
    .filter(
      (e) => compareVersions(e.version, previous) > 0 && compareVersions(e.version, current) <= 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The entry covering `version`, else the newest entry. */
export function entriesForManualOpen(
  entries: readonly ChangelogEntry[],
  version: string | null,
): ChangelogEntry[] {
  const newestFirst = [...entries].sort((a, b) => compareVersions(b.version, a.version));
  if (version && isVersion(version)) {
    const covering = newestFirst.find(
      (e) =>
        compareVersions(e.version, version) >= 0 &&
        compareVersions(e.from ?? e.version, version) <= 0,
    );
    if (covering) return [covering];
  }
  return newestFirst.slice(0, 1);
}

/** Every entry released up to `version`, newest first; all of them when `version` is unknown. */
export function releaseHistory(
  entries: readonly ChangelogEntry[],
  version: string | null,
): ChangelogEntry[] {
  return entries
    .filter((e) => !isVersion(version) || compareVersions(e.from ?? e.version, version) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

export type WhatsNewDecision =
  /** `since` null: no version was recorded before, so show only the running release. */
  | { show: true; since: string | null; record: string }
  /** `record` null: leave the stored version as it is. */
  | { show: false; record: string | null };

export function decideWhatsNew(input: {
  lastSeen: string | null;
  current: string;
  /**
   * Saved connections or tabs exist. With no recorded version this tells an update from a
   * version older than this feature apart from a fresh install.
   */
  hasExistingWorkspace: boolean;
}): WhatsNewDecision {
  const { current, hasExistingWorkspace } = input;
  if (!isVersion(current)) return { show: false, record: null };
  const lastSeen = isVersion(input.lastSeen) ? input.lastSeen : null;

  if (lastSeen === null) {
    return hasExistingWorkspace
      ? { show: true, since: null, record: current }
      : { show: false, record: current };
  }
  if (compareVersions(current, lastSeen) <= 0) return { show: false, record: null };
  return { show: true, since: lastSeen, record: current };
}

export function countChanges(entries: readonly ChangelogEntry[]): Record<ChangeKind, number> {
  const counts: Record<ChangeKind, number> = { new: 0, better: 0, fixed: 0 };
  for (const e of entries) for (const c of e.changes) counts[c.kind] += 1;
  return counts;
}

type VersionStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): VersionStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadLastSeenVersion(
  storage: VersionStorage | undefined = defaultStorage(),
): string | null {
  try {
    const raw = storage?.getItem(LAST_SEEN_VERSION_KEY);
    return isVersion(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastSeenVersion(
  version: string,
  storage: VersionStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // Unavailable storage means the drawer may show again next launch; that beats failing startup.
  }
}

export type TextSegment = { code: boolean; text: string };

/** Changelog lines mark code with backticks, as in Markdown. */
export function splitInlineCode(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ code: false, text: text.slice(last, start) });
    segments.push({ code: true, text: match[1]! });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ code: false, text: text.slice(last) });
  return segments;
}

/** Distance below the top of the scroll area at which a release counts as being read. */
const READING_LINE_PX = 64;

/**
 * Which release the reader is on, from each section's offset inside the scroll area. At the
 * bottom the last release wins even when it is too short to reach the reading line.
 */
export function activeReleaseIndex(
  sectionTops: readonly number[],
  scrollTop: number,
  options: { atBottom?: boolean } = {},
): number {
  if (sectionTops.length === 0) return -1;
  if (options.atBottom) return sectionTops.length - 1;
  let active = 0;
  sectionTops.forEach((top, i) => {
    if (top <= scrollTop + READING_LINE_PX) active = i;
  });
  return active;
}

export type ScrollFollow = {
  active: number;
  /** The release a click is smooth-scrolling to; null when the reader is scrolling. */
  target: number | null;
};

/**
 * The highlighted release after a scroll event. During a jump the highlight stays on the
 * clicked release: following each section the scroll passes made it hop through every one.
 */
export function followScroll(
  state: ScrollFollow,
  sectionTops: readonly number[],
  scrollTop: number,
  options: { targetTop?: number; atBottom?: boolean },
): ScrollFollow {
  if (state.target !== null) {
    const arrived =
      options.atBottom ||
      (options.targetTop !== undefined && Math.abs(scrollTop - options.targetTop) <= 2);
    return { active: state.target, target: arrived ? null : state.target };
  }
  return {
    active: activeReleaseIndex(sectionTops, scrollTop, { atBottom: options.atBottom }),
    target: null,
  };
}
