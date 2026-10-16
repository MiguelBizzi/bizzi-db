# Native Menu Bar Design

## Problem

Bizzi DB has no menu bar of its own. `run()` in `apps/desktop/src-tauri/src/lib.rs` never touches Tauri's menu API, so macOS shows Tauri's stock default menu. Every shortcut lives inside the webview: `⌘K` and `⌘R` in a capture-phase listener in `App.tsx`, `⌘↵` and `⌘⇧↵` as CodeMirror bindings in `SqlCodeEditor.tsx`, and `⌘C` in a grid hook in `DataExportMenu.tsx`.

Two consequences:

- Nothing is discoverable. A user can only learn a shortcut from a tooltip or the command palette.
- The palette advertises `⌘T` for "Open New SQL Query Tab", and nothing handles it. There is also no `⌘W`, no `⌘,`, no tab switching and no pane-split shortcut, even though the handlers exist in `App.tsx`.

A premium Mac app treats the menu bar as a first-class interface. This is a visible gap.

## Goal

A complete, native-feeling menu bar where every important action is reachable from a menu, shows its shortcut, and is enabled only when it makes sense. The model must adapt to Windows and Linux later without being redesigned.

## Success criteria

1. The app shows its own menus: Bizzi DB, File, Edit, Query, Connection, View, Window, Help.
2. Every important action has a menu item. Items with a shortcut display it.
3. Shortcuts are Command-based (with Option or Shift as modifiers). No Ctrl-based accelerators on macOS.
4. No two commands share an accelerator, and none collides with a reserved macOS shortcut. A test enforces this.
5. Menu items enable and disable with app state. For example, Delete Selected Rows is disabled with no selection, and Commit Pending Changes is disabled with nothing pending.
6. The standard edit shortcuts (`⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌘A`) keep working in text inputs and CodeMirror.
7. The command palette and tooltips read accelerators from the same registry as the menu.
8. Existing behaviour is unchanged: running queries, copy rows, refresh, palette, tabs, panes, saved workspace.
9. The menu model has no macOS assumptions in its data. A platform adapter produces the Windows/Linux layout, and unit tests cover it.

## Non-goals

- Shipping the Windows or Linux menus. The adapter exists and is tested, but only macOS is wired up now.
- User-customizable shortcuts.
- Features not in the agreed scope: sidebar toggle, zoom, duplicate tab, pane focus shortcuts, query cancel, Explain.
- A Rust-side menu. The menu is built from the frontend (see Architecture).
- Changing the command palette's content beyond reading accelerators from the registry.

## Design

### Architecture

The frontend owns the menu. Tauri 2.2.0's JS menu API (`@tauri-apps/api/menu`) provides `Menu`, `Submenu`, `MenuItem`, `PredefinedMenuItem`, `setEnabled`, `setAccelerator`, `setAsAppMenu`, `setAsWindowMenu`, `setAsWindowsMenuForNSApp` and `setAsHelpMenuForNSApp`. `core:default` already includes `core:menu:default`, which allows all of these, so the capability file needs no change.

Handlers are JS callbacks, so there is no Rust event bridge and no second list of ids. No Rust change is required: the host replaces the stock menu at runtime with `setAsAppMenu()`.

One consequence drives the design. A native menu accelerator on macOS consumes the keystroke before the webview sees it. So every key bound in a menu must dispatch through the menu path, and the existing in-webview listeners for those keys are removed. Standard edit items stay `PredefinedMenuItem`s so the responder chain keeps handling them.

### Modules (`apps/desktop/src/lib/commands/`)

Each module has one job and no React imports, so `bun test` covers it.

| Module | Responsibility |
|---|---|
| `registry.ts` | The typed command list. A command is `{ id, label, accelerator?, group, enabled(ctx), run key }`. Exports `commandById`. |
| `context.ts` | The `CommandContext` type and `deriveContext(appState)`. Fields: active tab type, selected row count, pending change count, connection state, modal open, text input or editor focused, SQL result present, tab count, closed-tab stack depth. |
| `menuModel.ts` | `buildMenuModel(platform)` returns nested `submenu`, `item`, `separator` and `predefined` nodes referencing command ids. Pure data. |
| `platformAdapter.ts` | Transforms the model per platform: macOS app menu vs File > Exit, `⌘` vs `Ctrl`, Settings placement, Help > About. |
| `accelerator.ts` | `formatAccelerator(acc, platform)` for display (`⌘⇧N`, `Ctrl+Shift+N`) and conversion to Tauri's `CmdOrCtrl+Shift+N` string. |
| `reserved.ts` | The reserved macOS accelerator list used by the conflict test. |
| `menuHost.ts` | The only module that imports `@tauri-apps/api/menu`. Builds Tauri objects from the model, installs them, and applies enablement changes. |
| `useAppMenu.ts` | The React hook in `App.tsx`: derives the context, supplies the handler map, and calls the host. |
| `shortcutsCheatSheet.ts` | Generates the rows for the Keyboard Shortcuts modal from the registry. |

`menuHost` keeps a map `commandId -> MenuItem`. On each context change it computes the next enabled flag per command and calls `setEnabled` only for items whose flag changed, so a keystroke-rate state change does not flood IPC.

### Menu map (macOS)

| Menu | Items (shortcut) |
|---|---|
| **Bizzi DB** | About Bizzi DB · Check for Updates… · Settings… `⌘,` · Services · Hide `⌘H` · Hide Others `⌥⌘H` · Show All · Quit `⌘Q` |
| **File** | New Query Tab `⌘T` · New Connection… `⌘N` · New Table… `⌘⇧N` · Save Query `⌘S` · Export Results… `⌘E` · Close Tab `⌘W` · Close Other Tabs `⌥⌘W` · Close Tabs to the Right · Reopen Closed Tab `⌘⇧T` · Close Window `⌘⇧W` |
| **Edit** | Undo `⌘Z` · Redo `⇧⌘Z` · Cut · Copy · Paste · Select All (all predefined) · Find in Table… `⌘F` · Insert Row `⌘I` · Delete Selected Rows `⌘⌫` · Toggle Comment `⌘/` · Format SQL `⌘⇧F` |
| **Query** | Run Statement or Selection `⌘↵` · Run All `⌘⇧↵` · Commit Pending Changes `⌘⇧S` · Discard Pending Changes · Review Pending Changes `⌘⇧P` |
| **Connection** | Switch Connection… · Back to Connections · Edit Connection… · Reconnect · Disconnect · Refresh Schema `⌘⇧R` · Refresh Table `⌘R` |
| **View** | Command Palette `⌘K` · Schema Diagram (ERD) `⌘⇧E` · Database Metrics `⌘⇧M` · Activity Log `⌘⇧L` · Next Tab `⌘⇧]` · Previous Tab `⌘⇧[` · Tab 1–9 `⌘1`–`⌘9` · Split Pane Right `⌥⌘\` · Split Pane Down · Enter Full Screen (predefined) |
| **Window** | Minimize `⌘M` · Zoom · Bring All to Front (macOS-managed via `setAsWindowsMenuForNSApp`) |
| **Help** | Documentation · Release Notes · Report an Issue · Keyboard Shortcuts… (macOS adds its own search via `setAsHelpMenuForNSApp`) |

Notes:

- Run Statement and Run Selection are one item. Its label is `Run Selection` when the editor has a selection and `Run Statement` otherwise, matching the current editor button text.
- Split Pane Down has no accelerator. It is reachable from the menu and the pane context menu.
- Disconnect and Discard Pending Changes have no accelerator. Delete Selected Rows uses `⌘⌫`, and every destructive item keeps its existing confirmation step.
- Documentation, Release Notes and Report an Issue open external URLs (the project's GitHub repository and web site). An item with no known URL at implementation time is omitted, not stubbed.

### Command ownership

Each command maps to an existing handler or a small new one.

| Existing handler (`App.tsx` unless noted) | Commands |
|---|---|
| `handleOpenNewQueryTab`, `openNewConnection`, `openEditConnection`, `handleBackToConnections`, `handleOpenConnection` | New Query Tab, New Connection, Edit Connection, Back to Connections, Switch Connection |
| `handleCloseTab`, `handleCloseTabs` (`tabPaneActions.ts`) | Close Tab, Close Other Tabs, Close Tabs to the Right |
| `openErd`, `openMetrics`, `openActivityLog`, `openPendingChanges` | ERD, Metrics, Activity Log, Review Pending Changes |
| `handleApproveAllChanges`, `handleCancelAllChanges` | Commit, Discard Pending Changes |
| `handleSplitPane`, `handleSelectPaneTab` | Split Right / Down, Next / Previous Tab, Tab 1–9 |
| `refreshTableRows`, `refreshConnectionSchemas` | Refresh Table, Refresh Schema |
| `SettingsModal` open state | Settings |
| `stageRowDeletes`, `DataExportMenu` export, `InsertRowDrawer` open | Delete Rows, Export Results, Insert Row |
| `SqlEditorTab` save-query form, `sql-formatter` format, CodeMirror run requests | Save Query, Format SQL, Run Statement / All |

New behaviour (small):

- **Reopen Closed Tab.** A bounded stack (20) of closed tab descriptors lives in a pure module, `closedTabs.ts`, fed by `handleCloseTab` and `handleCloseTabs`. Pinned or in-flight tabs are not special-cased beyond what close already does.
- **Find in Table.** Focuses the existing filter expression input in the active table toolbar. No new search engine.
- **Toggle Comment.** A CodeMirror command invoked on the focused editor.
- **Reconnect, Disconnect.** Thin wrappers over `connections_connect` and `connections_disconnect`.
- **New Table.** Opens the existing `CreateTableDesigner`.
- **Tab 1–9.** Selects the Nth tab of the focused pane. `⌘9` selects the last tab, following browser convention.

### Key routing and conflicts

- The `⌘K`/`⌘R` listener at `App.tsx:505` and the `Mod-Enter` and `Mod-Shift-Enter` bindings in `SqlCodeEditor.tsx` are removed. The menu handlers call the same code paths. The CodeMirror run path takes a `runRequest` from the focused view, so the menu handler obtains the editor view through a small ref registry (`editorRegistry.ts`) rather than a global.
- The grid's `⌘C` stays a context-sensitive behaviour. Copy is a predefined item, and the menu does not override it. The existing hook keeps working because `PredefinedMenuItem::Copy` forwards to the responder chain and the hook already defers to inputs and active text selections. Implementation must confirm this on a real build.
- Other in-webview Escape and Enter handlers (modals, drawers, popovers) are not menu-bound and are untouched.
- `reserved.ts` lists macOS-owned accelerators: `⌘Q`, `⌘H`, `⌥⌘H`, `⌘M`, `⌥⌘M`, `⌘`` (cycle windows), `⌃⌘F` (full screen), plus the system text-editing set. The conflict test fails if any command uses one or if two commands share one.

### Enablement

`enabled(ctx)` is a pure function per command. Representative rules:

| Command | Enabled when |
|---|---|
| Close Tab, Close Other Tabs | at least one tab; Close Other needs at least two |
| Reopen Closed Tab | closed stack is not empty |
| Save Query, Format SQL, Toggle Comment, Run | active tab is a SQL tab |
| Find in Table, Insert Row, Refresh Table | active tab is table data |
| Export Results | active tab is table data, or a SQL tab with a result |
| Delete Selected Rows | table data tab, at least one selected row, and no text input or editor focused (so `⌘⌫` keeps deleting to line start while typing) |
| Commit, Discard Pending Changes | pending count is greater than zero |
| Connection menu items | a connection is open (Switch and Back to Connections are always enabled) |
| Anything except Quit, Close Window, Settings, and edit items | no modal or drawer is open |

### Platform adaptation

`menuModel` emits a neutral model. `platformAdapter` applies three transformations: on macOS the first menu is the app menu with About, Settings, Services, Hide and Quit; on Windows and Linux About moves to Help, Settings moves to Edit, and Quit becomes File > Exit. Accelerators use `CmdOrCtrl`, so the same registry yields `Ctrl` shortcuts. Windows and Linux use `setAsWindowMenu`. Only the macOS path is installed in this work; the others are covered by model-level unit tests so nothing needs redesigning later.

### Keyboard Shortcuts modal

A modal generated from `shortcutsCheatSheet.ts` lists every command that has an accelerator, grouped by menu. It opens from Help > Keyboard Shortcuts… and gives users a single place to scan all shortcuts.

### Error handling

- If building or installing the menu throws (for example a permission problem), the app logs once and keeps running with the stock menu. Every action remains reachable through the UI.
- A handler that throws is caught at the menu boundary and surfaced through the existing `toast` helper. The menu stays responsive.
- A menu click for a command that became disabled between enablement sync and the click is ignored.

### Phasing

1. **Foundation.** Registry, context, model, accelerator formatting, host, `useAppMenu`, and the standard menus (Bizzi DB, Edit predefined, Window, Help). Wire existing actions: palette, ERD, metrics, activity log, pending changes, new query tab, refresh table, settings. Move `⌘K`, `⌘R` and run shortcuts onto the menu path. Palette and tooltips read the registry.
2. **Tabs and panes.** Close Tab, Close Others, Close to the Right, Reopen Closed Tab, Next/Previous Tab, Tab 1–9, Split Right/Down.
3. **Editor and grid.** Save Query, Format SQL, Toggle Comment, Find in Table, Insert Row, Delete Rows, Export Results, Commit, Discard, Review.
4. **Connection and schema.** Edit Connection, Reconnect, Disconnect, Refresh Schema, New Table, Switch Connection, Back to Connections, Help links, Keyboard Shortcuts modal.

Each phase ships working on its own. Menu items for later phases do not appear until their phase lands.

### Testing

Unit tests (`bun test`, alongside the existing `lib/*.test.ts` files):

- **Model snapshot.** `buildMenuModel('macos')` matches an inline expected structure, so menu changes are deliberate.
- **Accelerator uniqueness and reserved conflicts.** Fails on duplicates or reserved collisions.
- **Enabled predicates.** One table-driven test per rule above.
- **Platform adapter.** macOS, Windows and Linux layouts, including `CmdOrCtrl` conversion and Settings/About/Exit placement.
- **Accelerator formatting.** `⌘⇧N` and `Ctrl+Shift+N` from the same input.
- **Closed-tab stack.** Bounded, ordered, restores tab descriptors.
- **Cheat sheet.** Every command with an accelerator appears exactly once.

Manual verification on a running desktop build, per phase: the menu appears with the right items, shortcuts fire from the menu and from the keyboard, enablement tracks state, `⌘C/⌘V/⌘Z` still work in the SQL editor and filter input, and no previous shortcut regressed.

## Risks

- **Accelerators swallow keys the webview used.** Mitigation: every menu-bound key routes through the registry, standard edit keys stay predefined, accelerators that overlap text editing (`⌘⌫`, `⌘F`, `⌘/`, `⌘I`) are disabled while an input or editor that needs them is focused, and the manual check covers the SQL editor and inputs.
- **Menu appears after the webview loads.** The stock menu shows for a moment at launch. Accepted; building the menu from Rust would remove this at the cost of two sources of truth.
- **Tauri 2.2.0 menu quirks.** The version is pinned. Phase 1 is deliberately small so an API gap surfaces before the rest is built on it.
- **`⌘C` forwarding.** Confirmed only on a real build; if the responder-chain path does not reach the grid hook, the hook keeps its own listener and Copy stays predefined.
