import { describe, expect, test } from 'bun:test';
import {
  extractReleaseNotes,
  parseChangelog,
  renderChangelogData,
  renderChangelogMarkdown,
} from './changelogMarkdown';

const SAMPLE = `# Changelog

Notes for people who use the app.

## [Unreleased] - Next thing

Coming soon.

### New
- Something upcoming

## [0.1.18] - 2026-10-18 - Menus

A native menu.

### New
- Menu bar
- Views

### Fixed
- Crash

## [0.1.13] - 2026-10-10 - Milestone
<!-- from: 0.1.12, releases: 2 -->

Two releases.

### Better
- Faster
`;

describe('parseChangelog', () => {
  test('parses a release with summary and the three kinds', () => {
    const { entries } = parseChangelog(SAMPLE);
    expect(entries[0]).toEqual({
      version: '0.1.18',
      date: '2026-10-18',
      releases: 1,
      title: 'Menus',
      summary: 'A native menu.',
      changes: [
        { kind: 'new', text: 'Menu bar' },
        { kind: 'new', text: 'Views' },
        { kind: 'fixed', text: 'Crash' },
      ],
    });
  });

  test('reads the milestone comment into from and releases', () => {
    const entry = parseChangelog(SAMPLE).entries[1]!;
    expect(entry.version).toBe('0.1.13');
    expect(entry.from).toBe('0.1.12');
    expect(entry.releases).toBe(2);
  });

  test('treats [Unreleased] as upcoming and keeps it out of entries', () => {
    const { upcoming, entries } = parseChangelog(SAMPLE);
    expect(upcoming).toEqual({
      title: 'Next thing',
      summary: 'Coming soon.',
      changes: [{ kind: 'new', text: 'Something upcoming' }],
    });
    expect(entries.map((e) => e.version)).toEqual(['0.1.18', '0.1.13']);
  });

  test('parses CRLF input identically to LF', () => {
    expect(parseChangelog(SAMPLE.replace(/\n/g, '\r\n'))).toEqual(parseChangelog(SAMPLE));
  });

  test('rejects a heading that is not a version or Unreleased', () => {
    expect(() => parseChangelog('## [latest] - 2026-01-01 - Oops\n')).toThrow();
  });
});

describe('renderChangelogMarkdown', () => {
  test('round trips text with backticks, pipes, angle brackets, --> and unicode', () => {
    const parsed = {
      upcoming: null,
      entries: [
        {
          version: '1.2.3',
          from: '1.0.0',
          date: '2026-01-02',
          releases: 4,
          title: 'Title - with [brackets] and `code`',
          summary: 'Summary with `code`, a | pipe and <b>tags</b> --> end.',
          changes: [
            { kind: 'new' as const, text: 'Use `a | b` and <b>x</b> --> done' },
            { kind: 'new' as const, text: '- starts with a dash' },
            { kind: 'fixed' as const, text: 'Ünïcödé — ✓' },
          ],
        },
      ],
    };
    expect(parseChangelog(renderChangelogMarkdown(parsed))).toEqual(parsed);
  });

  test('keeps the order of changes when kinds interleave', () => {
    const parsed = {
      upcoming: null,
      entries: [
        {
          version: '0.1.16',
          date: '2026-10-14',
          releases: 1,
          title: 'T',
          summary: 'S.',
          changes: [
            { kind: 'fixed' as const, text: 'a' },
            { kind: 'fixed' as const, text: 'b' },
            { kind: 'better' as const, text: 'c' },
            { kind: 'fixed' as const, text: 'd' },
          ],
        },
      ],
    };
    expect(parseChangelog(renderChangelogMarkdown(parsed))).toEqual(parsed);
  });

  test('rejects change text containing a newline', () => {
    const entry = {
      version: '0.0.1',
      date: '2026-01-01',
      releases: 1,
      title: 'T',
      summary: 'S.',
      changes: [{ kind: 'new' as const, text: 'two\nlines' }],
    };
    expect(() => renderChangelogMarkdown({ upcoming: null, entries: [entry] })).toThrow();
  });
});

describe('extractReleaseNotes', () => {
  test('returns only the requested section', () => {
    expect(extractReleaseNotes(SAMPLE, '0.1.18')).toBe(
      'A native menu.\n\n### New\n- Menu bar\n- Views\n\n### Fixed\n- Crash\n',
    );
  });

  test('leaves out the milestone comment', () => {
    expect(extractReleaseNotes(SAMPLE, '0.1.13')).toBe('Two releases.\n\n### Better\n- Faster\n');
  });

  test('does not match a version prefix', () => {
    expect(() => extractReleaseNotes(SAMPLE, '0.1.1')).toThrow();
  });

  test('throws when the version has no section', () => {
    expect(() => extractReleaseNotes(SAMPLE, '9.9.9')).toThrow(/9\.9\.9/);
  });

  test('throws when the section has no changes', () => {
    const empty = '## [0.2.0] - 2026-11-01 - Empty\n\nJust a summary.\n';
    expect(() => extractReleaseNotes(empty, '0.2.0')).toThrow();
  });
});

describe('renderChangelogData', () => {
  test('starts with a generated-file banner and ends with a single LF newline', () => {
    const out = renderChangelogData(parseChangelog(SAMPLE));
    expect(out.startsWith('// Generated')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(out).not.toContain('\r');
  });

  test('exports UPCOMING and CHANGELOG with the parsed data', () => {
    const out = renderChangelogData(parseChangelog(SAMPLE));
    expect(out).toContain('export const UPCOMING: UpcomingEntry | null =');
    expect(out).toContain('export const CHANGELOG: ChangelogEntry[] =');
    expect(out).toContain('"version": "0.1.18"');
  });
});
