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

/**
 * Merged on main but not released yet. Shown as "Next release" above the timeline.
 * Move it into CHANGELOG with a version and date when you cut the release, then set this back to null.
 */
export const UPCOMING: UpcomingEntry | null = null;

// Newest first. Add an entry here whenever you cut a release (see RELEASING.md).
// Write for people who use the app, not for people who read the commits.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.18',
    date: '2026-10-18',
    releases: 1,
    title: 'A native menu bar, and objects managed in place',
    summary:
      'Actions now live in a native menu with keyboard shortcuts, and you can design views, write functions and inspect indexes without leaving the app.',
    changes: [
      {
        kind: 'new',
        text: 'A native macOS menu bar holds the main actions, with keyboard shortcuts for them. Help → Keyboard Shortcuts lists them all.',
      },
      {
        kind: 'new',
        text: 'Create views from File → New View, with a designer and the SQL it will run.',
      },
      {
        kind: 'new',
        text: 'Functions and procedures are listed in the schema view. Create, edit and drop them, with a code editor for the body.',
      },
      {
        kind: 'new',
        text: 'Indexes open in a drawer with their definition, and can be dropped after you confirm.',
      },
      {
        kind: 'fixed',
        text: 'Menu commands no longer fire while a dialog or drawer is open.',
      },
      {
        kind: 'fixed',
        text: 'A failed statement in a script no longer leaves the connection stuck in an aborted transaction.',
      },
    ],
  },
  {
    version: '0.1.17',
    date: '2026-10-15',
    releases: 1,
    title: 'Errors that tell you what went wrong',
    summary:
      'When a query fails you now see what the database actually said, what kind of problem it is, and where it happened. You can also run just part of your script.',
    changes: [
      {
        kind: 'new',
        text: 'Failed queries show the database\'s own message with its error code and a category: syntax, missing table or column, constraint, permission, connection or timeout.',
      },
      {
        kind: 'new',
        text: 'The error card points at the line and column, shows the offending line with a caret under it, and includes the database\'s hint, detail and the table, column or constraint involved.',
      },
      {
        kind: 'new',
        text: 'Cmd+Enter runs the selected SQL, or the statement under the cursor when nothing is selected. Cmd+Shift+Enter, or the run button menu, runs the whole script.',
      },
      {
        kind: 'better',
        text: 'The editor and the database agree on where each statement starts and ends, so what you see highlighted is what runs.',
      },
    ],
  },
  {
    version: '0.1.16',
    date: '2026-10-14',
    releases: 1,
    title: 'Filters that search the whole table',
    summary:
      'Table filters now ask the database instead of only looking at the rows already on screen.',
    changes: [
      {
        kind: 'fixed',
        text: 'Filtering by `id = 4477` finds the row even when it is not on the page you are viewing.',
      },
      {
        kind: 'fixed',
        text: 'Equality filters now behave like a real query: case-sensitive, exactly as Postgres compares them.',
      },
      {
        kind: 'better',
        text: 'Filtering counts the matching rows for paging, and changing a filter takes you back to page 1.',
      },
      {
        kind: 'better',
        text: 'Export respects the filters you have on, and load errors show up as a toast.',
      },
    ],
  },
  {
    version: '0.1.15',
    date: '2026-10-14',
    releases: 1,
    title: 'Big tables, no more waiting',
    summary:
      'Tables and query results load one page at a time, and scrolling stays smooth with thousands of rows.',
    changes: [
      {
        kind: 'new',
        text: 'Paging for table rows and query results, with the total counted on demand.',
      },
      {
        kind: 'new',
        text: 'Copy and export now grab every row, not just the page you have loaded, with a progress toast.',
      },
      {
        kind: 'better',
        text: 'Grids only draw what is on screen. Wide, tall results scroll smoothly and no longer risk running out of memory.',
      },
      {
        kind: 'better',
        text: 'Each connection keeps its own open tabs, so switching databases no longer wipes your workspace.',
      },
      {
        kind: 'better',
        text: 'Reopening a table tab reuses the rows you already fetched.',
      },
    ],
  },
  {
    version: '0.1.14',
    date: '2026-10-14',
    releases: 1,
    title: 'A friendlier SQL editor',
    summary:
      'Better autocomplete and colours in the editor, tables you can create without writing DDL, and a storage view.',
    changes: [
      {
        kind: 'new',
        text: 'Create tables straight from the schema view.',
      },
      {
        kind: 'new',
        text: 'Storage distribution chart in database metrics, to see which tables take the space.',
      },
      {
        kind: 'better',
        text: 'The SQL editor follows your theme in light and dark, and completions understand the query you are writing, quoted names included.',
      },
      {
        kind: 'better',
        text: 'Each SQL tab remembers its own state, and results refresh when the table they read from changes.',
      },
      {
        kind: 'better',
        text: 'Opening a connection shows a spinner, names the target, and reports a failure as a toast.',
      },
      {
        kind: 'fixed',
        text: 'Boolean columns come back as true and false instead of the text "t" and "f".',
      },
    ],
  },
  {
    version: '0.1.13',
    from: '0.1.12',
    date: '2026-10-13',
    releases: 2,
    title: 'Motion, with a calm switch',
    summary:
      'Modals, drawers, menus and tabs now move in and out, and you can turn it all down.',
    changes: [
      {
        kind: 'new',
        text: 'Animated modals, drawers, menus and popovers, plus press, focus and validation feedback.',
      },
      {
        kind: 'new',
        text: 'A motion preference with a reduced-motion mode.',
      },
      {
        kind: 'fixed',
        text: 'Reopening a panel mid-animation no longer reuses the old one, and closing panels stop taking clicks and keystrokes.',
      },
      {
        kind: 'fixed',
        text: 'Each DMG release uses its own volume name, so an older installer cannot get in the way.',
      },
    ],
  },
  {
    version: '0.1.11',
    from: '0.1.6',
    date: '2026-10-13',
    releases: 6,
    title: 'A proper install and updates that work',
    summary:
      'A new identity, an installer that looks right on every Mac, and in-app updates you can trust.',
    changes: [
      {
        kind: 'new',
        text: 'New Bizzi DB mark across the app, tray, installer and website.',
      },
      {
        kind: 'new',
        text: 'A branded DMG installer with a drag-to-Applications background.',
      },
      {
        kind: 'better',
        text: 'Updates download in the background and are checked against a signature before they install.',
      },
      {
        kind: 'fixed',
        text: 'The update banner now reaches "ready" instead of stalling after the download.',
      },
      {
        kind: 'fixed',
        text: 'Searching tables matches table names only, so results stop filling with unrelated hits.',
      },
      {
        kind: 'fixed',
        text: 'The installer background loads on every Mac.',
      },
    ],
  },
  {
    version: '0.1.5',
    from: '0.1.0',
    date: '2026-10-09',
    releases: 6,
    title: 'The first public builds',
    summary:
      'The foundation: connections, a SQL editor, an editable grid, schema tools and an ERD for Postgres on macOS.',
    changes: [
      {
        kind: 'new',
        text: 'Postgres connections with SSH tunnels and SSL, with passwords kept in the OS keychain.',
      },
      {
        kind: 'new',
        text: 'SQL editor, table grid with pending changes you review before they run, and a schema designer.',
      },
      {
        kind: 'new',
        text: 'Interactive ERD, command palette, and in-app update checks from GitHub Releases.',
      },
    ],
  },
];

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
