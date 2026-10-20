# Changelog

All notable changes to Bizzi DB are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

New entries go under `## [Unreleased]`; the release process moves them under a version heading. Write for people who use the app, not for people who read commits. See [RELEASING.md](RELEASING.md).

## [0.1.18] - 2026-10-18 - A native menu bar, and objects managed in place

Actions now live in a native menu with keyboard shortcuts, and you can design views, write functions and inspect indexes without leaving the app.

### New
- A native macOS menu bar holds the main actions, with keyboard shortcuts for them. Help → Keyboard Shortcuts lists them all.
- Create views from File → New View, with a designer and the SQL it will run.
- Functions and procedures are listed in the schema view. Create, edit and drop them, with a code editor for the body.
- Indexes open in a drawer with their definition, and can be dropped after you confirm.

### Fixed
- Menu commands no longer fire while a dialog or drawer is open.
- A failed statement in a script no longer leaves the connection stuck in an aborted transaction.

## [0.1.17] - 2026-10-15 - Errors that tell you what went wrong

When a query fails you now see what the database actually said, what kind of problem it is, and where it happened. You can also run just part of your script.

### New
- Failed queries show the database's own message with its error code and a category: syntax, missing table or column, constraint, permission, connection or timeout.
- The error card points at the line and column, shows the offending line with a caret under it, and includes the database's hint, detail and the table, column or constraint involved.
- Cmd+Enter runs the selected SQL, or the statement under the cursor when nothing is selected. Cmd+Shift+Enter, or the run button menu, runs the whole script.

### Better
- The editor and the database agree on where each statement starts and ends, so what you see highlighted is what runs.

## [0.1.16] - 2026-10-14 - Filters that search the whole table

Table filters now ask the database instead of only looking at the rows already on screen.

### Fixed
- Filtering by `id = 4477` finds the row even when it is not on the page you are viewing.
- Equality filters now behave like a real query: case-sensitive, exactly as Postgres compares them.

### Better
- Filtering counts the matching rows for paging, and changing a filter takes you back to page 1.
- Export respects the filters you have on, and load errors show up as a toast.

## [0.1.15] - 2026-10-14 - Big tables, no more waiting

Tables and query results load one page at a time, and scrolling stays smooth with thousands of rows.

### New
- Paging for table rows and query results, with the total counted on demand.
- Copy and export now grab every row, not just the page you have loaded, with a progress toast.

### Better
- Grids only draw what is on screen. Wide, tall results scroll smoothly and no longer risk running out of memory.
- Each connection keeps its own open tabs, so switching databases no longer wipes your workspace.
- Reopening a table tab reuses the rows you already fetched.

## [0.1.14] - 2026-10-14 - A friendlier SQL editor

Better autocomplete and colours in the editor, tables you can create without writing DDL, and a storage view.

### New
- Create tables straight from the schema view.
- Storage distribution chart in database metrics, to see which tables take the space.

### Better
- The SQL editor follows your theme in light and dark, and completions understand the query you are writing, quoted names included.
- Each SQL tab remembers its own state, and results refresh when the table they read from changes.
- Opening a connection shows a spinner, names the target, and reports a failure as a toast.

### Fixed
- Boolean columns come back as true and false instead of the text "t" and "f".

## [0.1.13] - 2026-10-13 - Motion, with a calm switch
<!-- from: 0.1.12, releases: 2 -->

Modals, drawers, menus and tabs now move in and out, and you can turn it all down.

### New
- Animated modals, drawers, menus and popovers, plus press, focus and validation feedback.
- A motion preference with a reduced-motion mode.

### Fixed
- Reopening a panel mid-animation no longer reuses the old one, and closing panels stop taking clicks and keystrokes.
- Each DMG release uses its own volume name, so an older installer cannot get in the way.

## [0.1.11] - 2026-10-13 - A proper install and updates that work
<!-- from: 0.1.6, releases: 6 -->

A new identity, an installer that looks right on every Mac, and in-app updates you can trust.

### New
- New Bizzi DB mark across the app, tray, installer and website.
- A branded DMG installer with a drag-to-Applications background.

### Better
- Updates download in the background and are checked against a signature before they install.

### Fixed
- The update banner now reaches "ready" instead of stalling after the download.
- Searching tables matches table names only, so results stop filling with unrelated hits.
- The installer background loads on every Mac.

## [0.1.5] - 2026-10-09 - The first public builds
<!-- from: 0.1.0, releases: 6 -->

The foundation: connections, a SQL editor, an editable grid, schema tools and an ERD for Postgres on macOS.

### New
- Postgres connections with SSH tunnels and SSL, with passwords kept in the OS keychain.
- SQL editor, table grid with pending changes you review before they run, and a schema designer.
- Interactive ERD, command palette, and in-app update checks from GitHub Releases.
