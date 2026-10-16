# Native Menu Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Bizzi DB a complete native macOS menu bar, driven by one typed command registry, with discoverable shortcuts and state-aware enablement.

**Architecture:** A pure-TypeScript command registry, menu model and platform adapter live in `apps/desktop/src/lib/commands/`. One module (`menuHost.ts`) turns the model into Tauri JS menu objects. Global actions are handled in `App.tsx`; actions that live in component state (SQL editor, data grid) register handlers on a small command bus. No Rust changes.

**Tech Stack:** Tauri 2.2.0 JS menu API (`@tauri-apps/api/menu`, pinned 2.2.0), React, CodeMirror 6, `bun test`, `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-10-15-native-menu-bar-design.md`

## Global Constraints

- Frontend-owned menu via `@tauri-apps/api/menu`; `core:default` already grants `core:menu:default`. No capability change unless a new plugin is added (Task 13 only).
- Accelerators are Command-based (`CmdOrCtrl`) with Option/Shift as modifiers; no Ctrl-based accelerators on macOS.
- No two commands share an accelerator; none may collide with the reserved list in `reserved.ts`.
- Standard edit items (`Undo Redo Cut Copy Paste Select All`) are `PredefinedMenuItem`s. Never rebind `⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌘A`.
- Every menu-bound key is removed from in-webview listeners (`App.tsx` `⌘K`/`⌘R`, CodeMirror `Mod-Enter`/`Mod-Shift-Enter`); the native accelerator consumes the keystroke.
- Destructive commands keep their existing confirmation step. Disconnect and Discard Pending Changes have no accelerator.
- Pinned versions stay as in `apps/desktop/package.json`; no new dependency except `@codemirror/commands` (Task 10, already in the lockfile transitively) and possibly an opener plugin (Task 13).
- If building the menu throws, log once and keep the stock menu. When not running under Tauri (`"__TAURI_INTERNALS__" in window` is false, e.g. `vite` in a browser) the host is a no-op.
- Each phase ships working on its own; items for later phases do not appear until their phase lands. Tests: `cd apps/desktop && bun test`; typecheck: `cd apps/desktop && bun run lint`.

## Refinements to the spec

The plan makes four decisions the spec left open:

- Component-local actions use a **command bus** (`commandBus.ts`) with claimable scopes, generalizing the spec's `editorRegistry`. It is needed because insert-row, save-query and similar state live inside `TableDataGrid` and `SqlEditorTab`, and because split panes can mount two editors.
- **Close Window** is an ordinary command (`⌘⇧W`, `getCurrentWindow().close()`), not Tauri's predefined item, whose hardcoded `⌘W` would collide with Close Tab.
- **Tab 1–9** live in a `Go to Tab` submenu inside View.
- The **Help** menu lands in Phase 4 with its links and the shortcuts modal; an empty Help menu has no value earlier.

## Review Focus

- Typing in an input or CodeMirror: `⌘⌫`, `⌘F`, `⌘/`, `⌘I` must keep editing text, so those commands are disabled while a text target is focused (Task 3).
- Two SQL editors in split panes: Run, Format and Save go to the editor that was focused last, not the first mounted (Task 2).
- `⌘3` with two tabs does nothing; `⌘9` selects the last tab; Next Tab wraps (Task 8).
- Reopen Closed Tab for a table tab whose table was dropped is skipped, not opened broken (Task 8).
- Menu install failure or non-Tauri runtime leaves the app fully usable; a handler that throws shows a toast and the menu stays responsive (Tasks 2, 5).

---

## Phase 1 — Foundation

### Task 1: Accelerator parsing, formatting, reserved list

**Files:**
- Create: `apps/desktop/src/lib/commands/accelerator.ts`, `apps/desktop/src/lib/commands/reserved.ts`
- Test: `apps/desktop/src/lib/commands/accelerator.test.ts`

**Interfaces:**
- Produces:
  - `type Platform = 'macos' | 'windows' | 'linux'`
  - `parseAccelerator(acc: string): { cmd: boolean; shift: boolean; alt: boolean; ctrl: boolean; key: string }` — input is a Tauri-style string such as `CmdOrCtrl+Shift+N`; throws on an unknown modifier or empty key.
  - `normalizeAccelerator(acc: string): string` — canonical form (`CmdOrCtrl+Alt+Shift+KEY`, key uppercased) used for equality.
  - `formatAccelerator(acc: string, platform: Platform): string` — macOS `⌃⌥⇧⌘` order with glyphs (`Enter`→`↵`, `Backspace`→`⌫`); Windows/Linux `Ctrl+Shift+N`.
  - `toTauriAccelerator(acc: string): string` — the validated string passed to `MenuItem.new`.
  - `RESERVED_ACCELERATORS: readonly string[]`: `CmdOrCtrl+Q`, `CmdOrCtrl+H`, `CmdOrCtrl+Alt+H`, `CmdOrCtrl+M`, `CmdOrCtrl+Alt+M`, ``CmdOrCtrl+` ``, `Ctrl+CmdOrCtrl+F`, `CmdOrCtrl+Z`, `CmdOrCtrl+Shift+Z`, `CmdOrCtrl+X`, `CmdOrCtrl+C`, `CmdOrCtrl+V`, `CmdOrCtrl+A`.

- [ ] **Step 1: Write failing tests** in `accelerator.test.ts` using `bun:test`: `formatAccelerator('CmdOrCtrl+Shift+N','macos') === '⇧⌘N'`; `formatAccelerator('CmdOrCtrl+Alt+W','macos') === '⌥⌘W'`; `formatAccelerator('CmdOrCtrl+Shift+Enter','macos') === '⇧⌘↵'`; `formatAccelerator('CmdOrCtrl+Backspace','macos') === '⌘⌫'`; `formatAccelerator('CmdOrCtrl+Shift+N','windows') === 'Ctrl+Shift+N'`; `normalizeAccelerator('Shift+CmdOrCtrl+n') === normalizeAccelerator('CmdOrCtrl+Shift+N')`; `parseAccelerator('Hyper+N')` throws; `parseAccelerator('CmdOrCtrl+')` throws.
- [ ] **Step 2: Run** `cd apps/desktop && bun test src/lib/commands/accelerator.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the four functions in `accelerator.ts` and the constant in `reserved.ts`. Split on `+`; accept `Cmd`, `CmdOrCtrl`, `Ctrl`, `Alt`/`Option`, `Shift` as modifiers; the last token is the key.
- [ ] **Step 4: Run** the test file — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): accelerator parsing and formatting for the menu bar`.

### Task 2: Command context and command bus

**Files:**
- Create: `apps/desktop/src/lib/commands/context.ts`, `apps/desktop/src/lib/commands/commandBus.ts`
- Test: `apps/desktop/src/lib/commands/context.test.ts`, `apps/desktop/src/lib/commands/commandBus.test.ts`

**Interfaces:**
- Consumes: `TabType` from `apps/desktop/src/types.ts`.
- Produces:
  - `interface CommandContext { activeTabType: TabType | null; tabCount: number; paneTabCount: number; selectedRowCount: number; pendingCount: number; connectionOpen: boolean; modalOpen: boolean; textInputFocused: boolean; sqlSelectionPresent: boolean; sqlResultPresent: boolean; closedTabCount: number }`
  - `EMPTY_CONTEXT: CommandContext` (zeros, `false`, `null`).
  - `isTextInputTarget(el: { closest(selector: string): unknown } | null): boolean` — true for `input, textarea, select, [contenteditable="true"], .cm-content`.
  - `type CommandHandler = () => void | Promise<void>`
  - `interface CommandScope { claim(): void; setContext(patch: Partial<CommandContext>): void; dispose(): void }`
  - `registerScope(owner: string, handlers: Record<string, CommandHandler>): CommandScope` — the most recently claimed (or registered) scope owning a command id wins; `claim()` moves a scope to the top.
  - `getLocalContext(): Partial<CommandContext>` — scope patches merged in claim order, later wins.
  - `runCommand(id: string, onError?: (error: unknown) => void): boolean` — false if no handler; a throwing or rejecting handler is caught and passed to `onError`, never rethrown.
  - `subscribeBus(listener: () => void): () => void` — fires on register, claim, dispose and `setContext`.

- [ ] **Step 1: Write failing tests.**
  - `context.test.ts`: `isTextInputTarget(null) === false`; a fake whose `closest` returns a truthy value for `'input, textarea, select, [contenteditable="true"], .cm-content'` returns true; one returning `null` returns false.
  - `commandBus.test.ts`: (a) two scopes register `query.run`; running calls the later one; after `a.claim()` running calls `a` (split-pane case); (b) `dispose()` of the top scope falls back to the previous; (c) `runCommand('nope') === false`; (d) a handler that throws calls `onError` once and `runCommand` still returns true; same for a rejecting async handler (await a microtask); (e) `getLocalContext()` merges two scopes' patches with the later-claimed winning; disposing a scope removes its patch; (f) `subscribeBus` fires on `setContext`.
- [ ] **Step 2: Run** both files — expect FAIL.
- [ ] **Step 3: Implement** `context.ts` and `commandBus.ts` as module-level state (an ordered array of scopes). Keep it free of React imports.
- [ ] **Step 4: Run** both files — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): command context and command bus`.

### Task 3: Command registry (Phase 1 commands) and shortcut labels

**Files:**
- Create: `apps/desktop/src/lib/commands/registry.ts`, `apps/desktop/src/lib/commands/shortcutLabel.ts`
- Test: `apps/desktop/src/lib/commands/registry.test.ts`

**Interfaces:**
- Consumes: `CommandContext`, `normalizeAccelerator`, `RESERVED_ACCELERATORS`, `formatAccelerator`.
- Produces:
  - `interface Command { id: string; label: string; dynamicLabel?(ctx: CommandContext): string; accelerator?: string; enabled(ctx: CommandContext): boolean; allowInModal?: boolean; typingConflict?: boolean }`
  - `COMMANDS: readonly Command[]`, `commandById(id: string): Command`
  - `isCommandEnabled(cmd: Command, ctx: CommandContext): boolean` — false when `ctx.modalOpen && !cmd.allowInModal`; false when `cmd.typingConflict && ctx.textInputFocused`; otherwise `cmd.enabled(ctx)`.
  - `menuState(ctx: CommandContext): { enabled: Record<string, boolean>; labels: Record<string, string> }`
  - `shortcutLabel(id: string, platform?: Platform): string` in `shortcutLabel.ts` — display string, `''` when the command has no accelerator; platform defaults from `navigator.userAgent`.

Phase 1 commands (id, label, accelerator, enabled when): `app.settings` "Settings…" `CmdOrCtrl+,` (always, `allowInModal`); `app.checkUpdates` "Check for Updates…" (always); `file.newQuery` "New Query Tab" `CmdOrCtrl+T` (connection open); `file.closeWindow` "Close Window" `CmdOrCtrl+Shift+W` (always, `allowInModal`); `query.run` "Run Statement" with `dynamicLabel` → "Run Selection" when `sqlSelectionPresent`, `CmdOrCtrl+Enter` (active tab is `sql_editor`); `query.runAll` "Run All" `CmdOrCtrl+Shift+Enter` (same); `query.review` "Review Pending Changes" `CmdOrCtrl+Shift+P` (connection open); `conn.refreshTable` "Refresh Table" `CmdOrCtrl+R` (active tab is `table_data`); `view.palette` "Command Palette…" `CmdOrCtrl+K` (connection open); `view.erd` "Schema Diagram (ERD)" `CmdOrCtrl+Shift+E`, `view.metrics` "Database Metrics" `CmdOrCtrl+Shift+M`, `view.activity` "Activity Log" `CmdOrCtrl+Shift+L` (all connection open).

- [ ] **Step 1: Write failing tests** in `registry.test.ts`: (a) every accelerator is unique under `normalizeAccelerator`; (b) none appears in `RESERVED_ACCELERATORS`; (c) every id is unique; (d) table-driven `isCommandEnabled` rows: `query.run` enabled only for `activeTabType: 'sql_editor'`; `conn.refreshTable` only for `'table_data'`; with `modalOpen: true`, `view.erd` is disabled and `app.settings` enabled; `typingConflict` command disabled when `textInputFocused` (use an inline test command); (e) `menuState` label for `query.run` is "Run Selection" with `sqlSelectionPresent: true`, else "Run Statement"; (f) `shortcutLabel('file.newQuery','macos') === '⌘T'`, `shortcutLabel('app.checkUpdates','macos') === ''`.
- [ ] **Step 2: Run** `bun test src/lib/commands/registry.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `registry.ts` and `shortcutLabel.ts`. Later tasks add commands to `COMMANDS`; the generic tests (a)–(c) cover them automatically.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): command registry for menu bar phase 1`.

### Task 4: Menu model and platform adapter

**Files:**
- Create: `apps/desktop/src/lib/commands/menuModel.ts`, `apps/desktop/src/lib/commands/platformAdapter.ts`
- Test: `apps/desktop/src/lib/commands/menuModel.test.ts`

**Interfaces:**
- Consumes: `Platform`, command ids from Task 3.
- Produces:
  - `type PredefinedKind = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'about' | 'services' | 'hide' | 'hideOthers' | 'showAll' | 'quit' | 'minimize' | 'maximize' | 'fullscreen' | 'bringAllToFront'`
  - `type MenuNode = { kind: 'item'; commandId: string } | { kind: 'separator' } | { kind: 'predefined'; item: PredefinedKind } | { kind: 'submenu'; id: string; label: string; items: MenuNode[]; role?: 'window' | 'help' }`
  - `buildMenuModel(): MenuNode[]` — the neutral (macOS-shaped) model; Phase 1 submenus: `app` ("Bizzi DB": About, Check for Updates…, sep, Settings…, sep, Services, sep, Hide, Hide Others, Show All, sep, Quit), `file` (New Query Tab, sep, Close Window), `edit` (the six predefined edit items with a separator after Redo and after Cut/Copy/Paste), `query` (Run, Run All, sep, Review Pending Changes), `connection` (Refresh Table), `view` (Command Palette…, sep, ERD, Metrics, Activity Log, sep, Full Screen), `window` (`role: 'window'`: Minimize, Maximize, sep, Bring All to Front).
  - `adaptMenuModel(model: MenuNode[], platform: Platform): MenuNode[]` — `macos` returns the model unchanged; `windows`/`linux`: remove the `app` submenu, move Settings… to the end of `edit` after a separator, move `quit` to the end of `file` after a separator (kept as predefined `quit`, shown as Exit by the host), move About and Check for Updates… into a `help` submenu (`role: 'help'`), drop Services/Hide items.

- [ ] **Step 1: Write failing tests** in `menuModel.test.ts`: (a) top-level submenu ids on macOS equal `['app','file','edit','query','connection','view','window']`; (b) every `item.commandId` in the model exists in `COMMANDS`, and every command in `COMMANDS` appears in the model exactly once (walk the tree and count); (c) the `edit` submenu begins with predefined `undo`; (d) on `windows`, no `app` submenu exists, `edit` ends with `app.settings`, `file` ends with predefined `quit`, and a `help` submenu contains `app.checkUpdates`; (e) `adaptMenuModel(model,'macos')` deep-equals `model`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** both modules. Pure functions; `adaptMenuModel` must not mutate its input.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): menu model and platform adapter`.

### Task 5: Menu host (Tauri wiring)

**Files:**
- Create: `apps/desktop/src/lib/commands/menuHost.ts`
- Test: `apps/desktop/src/lib/commands/menuHost.test.ts`

**Interfaces:**
- Consumes: `MenuNode`, `Platform`, `commandById`, `toTauriAccelerator`.
- Produces:
  - `diffState(prev: Record<string, boolean | string>, next: Record<string, boolean | string>): Record<string, boolean | string>` — only keys whose value changed (pure).
  - `interface MenuApi` — the minimal surface of `@tauri-apps/api/menu` the host uses (constructors for `Menu`, `Submenu`, `MenuItem`, `PredefinedMenuItem`), so tests can inject a fake; `tauriMenuApi: MenuApi` is the real binding.
  - `interface MenuHost { applyState(state: { enabled: Record<string, boolean>; labels: Record<string, string> }): Promise<void> }`
  - `installMenu(opts: { model: MenuNode[]; platform: Platform; onRun(commandId: string): void; api?: MenuApi }): Promise<MenuHost | null>` — builds the menu, calls `setAsAppMenu()` on macOS and `setAsWindowMenu()` otherwise, calls `setAsWindowsMenuForNSApp()` / `setAsHelpMenuForNSApp()` on macOS for submenus with those roles. Returns `null` (after one `console.error`) when anything throws, and returns `null` immediately when not running under Tauri. Item actions call `onRun(commandId)`. `applyState` calls `setEnabled`/`setText` only for changed values.
- The host only wires menu items. Close Window is a normal command whose handler calls `getCurrentWindow().close()` (the predefined CloseWindow item hardcodes `⌘W`, which belongs to Close Tab).

- [ ] **Step 1: Write failing tests** with a fake `MenuApi` that records calls: (a) `diffState` returns only changed keys; (b) installing a macOS model calls `setAsAppMenu` once and never `setAsWindowMenu`; windows calls `setAsWindowMenu`; (c) a `window`-role submenu triggers `setAsWindowsMenuForNSApp` on macOS only; (d) `applyState` called twice with identical state results in `setEnabled` calls only the first time; (e) when the fake's `Menu.new` throws, `installMenu` resolves `null` and `console.error` was called once; (f) invoking a created item's action calls `onRun` with its command id.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `menuHost.ts`. `tauriMenuApi` wraps `Menu`, `Submenu`, `MenuItem`, `PredefinedMenuItem` from `@tauri-apps/api/menu`. Not-under-Tauri check: `typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): Tauri menu host with diffed enablement`.

### Task 6: Wire Phase 1 into `App.tsx`

**Files:**
- Create: `apps/desktop/src/lib/commands/useAppMenu.ts`
- Modify: `apps/desktop/src/App.tsx` (remove the `⌘K`/`⌘R` listener near line 505; add handler registration and context derivation), `apps/desktop/src/components/CommandPalette.tsx` (shortcut label from the registry), `apps/desktop/src/components/Navbar.tsx` and `apps/desktop/src/components/TableView/TableToolbar.tsx` (the `⌘K` / `⌘R` hint text from `shortcutLabel`)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `useAppMenu(args: { context: CommandContext; handlers: Record<string, CommandHandler> }): void` — on mount registers `handlers` as a scope (`owner: 'app'`, stable wrappers reading the latest map from a ref), installs the menu (`buildMenuModel` → `adaptMenuModel` → `installMenu`), tracks `textInputFocused` via `focusin`/`focusout` with `isTextInputTarget`, and on every context or bus change calls `host.applyState(menuState({...context, ...getLocalContext(), textInputFocused}))`. `onRun` ignores the click when the command is currently disabled, otherwise calls `runCommand(id, (e) => toast.error(...))`.

Handler map for Phase 1 in `App.tsx`: `app.settings` → `setIsSettingsOpen(true)`; `app.checkUpdates` → `checkForAppUpdateManually`; `file.newQuery` → `handleOpenNewQueryTab()`; `file.closeWindow` → `getCurrentWindow().close()`; `query.review` → `openPendingChanges`; `conn.refreshTable` → the refresh logic currently in the removed listener, extracted into a named `refreshActiveTable` function in `App.tsx` (find the active table tab, skip when a load is already in flight, call `refreshTableRows`); `view.palette` → toggle `isCommandPaletteOpen`; `view.erd`/`view.metrics`/`view.activity` → `openErd`/`openMetrics`/`setIsActivityLogOpen(true)`.

Context for Phase 1: `activeTabType` from the focused tab, `connectionOpen: Boolean(currentDbId)`, `modalOpen: isCommandPaletteOpen || isSettingsOpen || isConnectionModalOpen || isPendingChangesOpen || isActivityLogOpen || Boolean(tableActionConfirm)`, `tabCount`, `pendingCount`.

- [ ] **Step 1: Write a failing test** `useAppMenu`-free: add to `registry.test.ts` a table-driven test that `menuState` for a realistic context (SQL tab active, connection open, nothing pending) enables exactly `file.newQuery`, `query.run`, `query.runAll`, `view.*`, `query.review`, `app.*`, `file.closeWindow` and disables `conn.refreshTable`. Run — expect FAIL until the context matches.
- [ ] **Step 2: Implement** `useAppMenu.ts` and the `App.tsx` changes above. Delete the `useEffect` that registers the `keydown` listener at `App.tsx:505-529` (and the `isMod` logic with it).
- [ ] **Step 3: Update labels** in `CommandPalette.tsx` (`MOD_K`, the `⌘T` shortcut), `Navbar.tsx` and `TableToolbar.tsx` to call `shortcutLabel(...)`. This also makes the previously dead `⌘T` hint true.
- [ ] **Step 4: Run** `bun test` and `bun run lint` — expect all PASS, no type errors.
- [ ] **Step 5: Verify in the running app** with `bun run dev` (`tauri dev`): the menu bar shows Bizzi DB, File, Edit, Query, Connection, View, Window; `⌘K` opens the palette, `⌘R` refreshes a table tab, `⌘T` opens a query tab, `⌘,` opens Settings; `⌘C/⌘V/⌘Z` still work in the SQL editor and in the filter input; items gray out with no connection. Confirm each non-trivial key string (`,` `/` `[` `]` `\` `Enter` `Backspace`) is accepted — if Tauri rejects one, switch to its named key (e.g. `Comma`, `Slash`) in the registry and note it in the commit.
- [ ] **Step 6: Commit** `feat(desktop): native menu bar foundation (phase 1)`.

### Task 7: Run commands from the menu

**Files:**
- Modify: `apps/desktop/src/components/SqlEditor/SqlCodeEditor.tsx` (remove the `Mod-Enter` / `Mod-Shift-Enter` entries at lines 112-123; keep `Ctrl-Space`; expose the `EditorView` and selection state via new props), `apps/desktop/src/components/SqlEditor/SqlEditorTab.tsx` (register a scope, claim on focus, publish selection context, update the tooltip/label hints at lines 386 and 410 to `shortcutLabel`)

**Interfaces:**
- Consumes: `registerScope`, `shortcutLabel`, existing `runRequest(view, 'auto' | 'all')` and `onRunRef`.
- Produces: `SqlCodeEditor` prop `onViewReady?: (view: EditorView | null) => void` and `onSelectionChange?: (hasSelection: boolean) => void`.

- [ ] **Step 1: Confirm bus coverage.** The split-pane ownership and context-merge behaviour this task relies on is tested in Task 2; the remaining work is component wiring with no new pure logic, so it is verified in the app (Step 4).
- [ ] **Step 2: Implement** in `SqlEditorTab`: `useEffect` registers a scope `sql:${tabId}` with `query.run` → `onRunRef.current(runRequest(view, 'auto'))` and `query.runAll` → `'all'`; call `scope.claim()` on the tab root's `focusin`; `onSelectionChange` calls `scope.setContext({ sqlSelectionPresent })`; dispose on unmount.
- [ ] **Step 3: Run** `bun test` and `bun run lint` — expect PASS.
- [ ] **Step 4: Verify in the app:** `⌘↵` runs the statement under the caret, runs only the selection when text is selected (menu label flips to "Run Selection"), `⌘⇧↵` runs all; with two split SQL panes the focused pane runs.
- [ ] **Step 5: Commit** `feat(desktop): run queries from the menu bar`.

---

## Phase 2 — Tabs and panes

### Task 8: Tab helpers (pure)

**Files:**
- Create: `apps/desktop/src/lib/closedTabs.ts`, `apps/desktop/src/lib/tabNavigation.ts`
- Test: `apps/desktop/src/lib/closedTabs.test.ts`, `apps/desktop/src/lib/tabNavigation.test.ts`

**Interfaces:**
- Produces:
  - `interface ClosedTab { tab: WorkspaceTab; paneId: string; index: number }`
  - `pushClosed(stack: ClosedTab[], entries: ClosedTab[], max = 20): ClosedTab[]` — newest last, oldest dropped beyond `max`.
  - `popReopenable(stack: ClosedTab[], isValid: (tab: WorkspaceTab) => boolean): { entry: ClosedTab; rest: ClosedTab[] } | null` — pops from the end, discarding entries failing `isValid`.
  - `adjacentTabId(tabIds: string[], activeId: string, delta: 1 | -1): string | null` — wraps; `null` when fewer than 2 tabs.
  - `nthTabId(tabIds: string[], n: number): string | null` — `n` is 1-based; `n === 9` returns the last tab; `n > tabIds.length` returns `null`.

- [ ] **Step 1: Write failing tests:** `pushClosed` keeps 20 and drops the oldest; `popReopenable` returns the newest valid entry and drops invalid ones above it (a closed table tab whose table no longer exists is skipped); returns `null` on an empty or all-invalid stack; `adjacentTabId(['a','b','c'],'c',1) === 'a'` and `(…,'a',-1) === 'c'`; single tab → `null`; `nthTabId(['a','b'],3) === null`; `nthTabId(['a','b','c'],9) === 'c'`; `nthTabId(['a','b','c'],2) === 'b'`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(desktop): closed-tab stack and tab navigation helpers`.

### Task 9: Tab and pane commands

**Files:**
- Modify: `apps/desktop/src/lib/commands/registry.ts`, `apps/desktop/src/lib/commands/menuModel.ts`, `apps/desktop/src/lib/commands/menuModel.test.ts`, `apps/desktop/src/lib/commands/registry.test.ts`, `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: Task 8 helpers; `handleCloseTab`, `handleCloseTabs`, `handleSplitPane`, `handleSelectPaneTab`, `leafPanes`/`paneById` from `workspaceLayout.ts`.
- Produces commands: `file.closeTab` "Close Tab" `CmdOrCtrl+W` (≥1 tab in focused pane); `file.closeOthers` "Close Other Tabs" `CmdOrCtrl+Alt+W` (pane has ≥2 tabs); `file.closeRight` "Close Tabs to the Right" (pane has ≥2 tabs); `file.reopenTab` "Reopen Closed Tab" `CmdOrCtrl+Shift+T` (`closedTabCount > 0`); `view.nextTab` `CmdOrCtrl+Shift+]` and `view.prevTab` `CmdOrCtrl+Shift+[` ("Next Tab"/"Previous Tab", pane has ≥2 tabs); `view.tab.1`…`view.tab.9` `CmdOrCtrl+1`…`CmdOrCtrl+9`, shown in a `Go to Tab` submenu (`id: 'view.goToTab'`); `view.splitRight` "Split Pane Right" `CmdOrCtrl+Alt+\` and `view.splitDown` "Split Pane Down" (no accelerator), both enabled with a tab active.
- `App.tsx` keeps `closedTabs` in state (`useState<ClosedTab[]>`), pushes in `handleCloseTab`/`handleCloseTabs`, and publishes `closedTabCount` and `paneTabCount` in the context. Reopen uses `popReopenable` with `isValid` rejecting `table_data`/`schema_designer` tabs whose `tableId` is not in `currentDatabase.tables`, restores into the original pane if it still exists else the focused pane, and shows `toast.error('No closed tab to reopen')` when nothing is valid.

- [ ] **Step 1: Write failing tests:** add the new commands to the registry tests' table (`file.closeOthers` disabled with `paneTabCount: 1`, `view.nextTab` disabled with 1 tab, `file.reopenTab` disabled with `closedTabCount: 0`); update the menu-model count test and macOS id assertions (File gains the new items, View gains the tab and split items).
- [ ] **Step 2: Run** `bun test` — expect FAIL.
- [ ] **Step 3: Implement** registry entries, model additions (File: New Query Tab, sep, Close Tab, Close Other Tabs, Close Tabs to the Right, Reopen Closed Tab, sep, Close Window; View: Next/Previous Tab, Go to Tab, sep, Split Right/Down) and the `App.tsx` handlers and context fields.
- [ ] **Step 4: Run** `bun test` and `bun run lint` — expect PASS.
- [ ] **Step 5: Verify in the app:** `⌘W` closes the active tab (and pinned tabs stay), `⌘⇧T` reopens it with its SQL intact, `⌘3` is a no-op with two tabs, `⌘9` selects the last, `⌘⇧]` wraps, `⌥⌘\` splits.
- [ ] **Step 6: Commit** `feat(desktop): tab and pane menu commands (phase 2)`.

---

## Phase 3 — Editor and grid

### Task 10: Editor commands (Save, Format, Toggle Comment)

**Files:**
- Modify: `registry.ts`, `menuModel.ts` and their tests; `apps/desktop/src/components/SqlEditor/SqlEditorTab.tsx`

**Interfaces:**
- Produces commands: `file.saveQuery` "Save Query…" `CmdOrCtrl+S` (SQL tab), `edit.formatSql` "Format SQL" `CmdOrCtrl+Shift+F` (SQL tab), `edit.toggleComment` "Toggle Comment" `CmdOrCtrl+/` (SQL tab, `typingConflict: false` because it acts inside the editor — enabled when the active tab is SQL even while the editor is focused).
- `SqlEditorTab` scope adds `file.saveQuery` → `handleOpenSaveModal`, `edit.formatSql` → `handleFormatQuery`, `edit.toggleComment` → CodeMirror's `toggleComment` command from `@codemirror/commands` run on the view from Task 7. `@codemirror/commands` is only a transitive dependency today (`bun.lock` resolves 6.11.0), so add `"@codemirror/commands": "^6.11.0"` to `apps/desktop/package.json` dependencies and run `bun install` to keep the lockfile in sync.

- [ ] **Step 1: Write failing tests:** registry rows (all three enabled only for `sql_editor`; disabled with `modalOpen`); model snapshot additions (File: Save Query…; Edit: Format SQL, Toggle Comment).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** registry, model and scope handlers. `Toggle Comment` must be a no-op when the view is null.
- [ ] **Step 4: Run** `bun test` and `bun run lint` — expect PASS.
- [ ] **Step 5: Verify in the app:** `⌘S` opens the save-query form, `⌘⇧F` reformats, `⌘/` toggles `--` comments on the selected lines; with two split editors each goes to the focused one.
- [ ] **Step 6: Commit** `feat(desktop): save, format and comment from the menu bar`.

### Task 11: Grid and pending-changes commands

**Files:**
- Modify: `registry.ts`, `menuModel.ts` and tests; `apps/desktop/src/components/TableView/TableDataGrid.tsx`, `apps/desktop/src/components/TableView/TableToolbar.tsx` / `FilterExpressionInput.tsx` (focus handle), `apps/desktop/src/components/DataExport/DataExportMenu.tsx` (expose an export trigger), `apps/desktop/src/App.tsx`

**Interfaces:**
- Produces commands: `edit.find` "Find in Table…" `CmdOrCtrl+F` (`table_data`, `typingConflict: true`); `edit.insertRow` "Insert Row" `CmdOrCtrl+I` (`table_data`, `typingConflict: true`); `edit.deleteRows` "Delete Selected Rows" `CmdOrCtrl+Backspace` (`table_data`, `selectedRowCount > 0`, `typingConflict: true`); `file.export` "Export Results…" `CmdOrCtrl+E` (`table_data`, or `sql_editor` with `sqlResultPresent`); `query.commit` "Commit Pending Changes" `CmdOrCtrl+Shift+S` and `query.discard` "Discard Pending Changes" (no accelerator), both enabled when `pendingCount > 0`.
- `TableDataGrid` registers a scope `grid:${tabId}`: `edit.find` focuses the filter expression input; `edit.insertRow` → `setInsertOpen(true)`; `edit.deleteRows` → the existing delete path (`onDeleteSelectedRows`, still staging, not applying); `file.export` opens the existing export menu's CSV export (same action as the toolbar's default). It claims on `focusin` and publishes `selectedRowCount` via `scope.setContext`. `SqlEditorTab` publishes `sqlResultPresent` and registers `file.export` for its results. `App.tsx` maps `query.commit` → `handleApproveAllChanges` and `query.discard` → `handleCancelAllChanges`.
- The existing grid `⌘C` hook in `DataExportMenu.tsx` stays.

- [ ] **Step 1: Write failing tests:** registry rows for each command, including `typingConflict`: `edit.find`, `edit.insertRow` and `edit.deleteRows` disabled with `textInputFocused: true`; `edit.deleteRows` disabled with `selectedRowCount: 0`; `file.export` enabled for a SQL tab only with `sqlResultPresent: true`; `query.commit` disabled with `pendingCount: 0`. Update model tests (Edit, File, Query submenus).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** registry, model, grid/editor scopes and `App.tsx` mappings.
- [ ] **Step 4: Run** `bun test` and `bun run lint` — expect PASS.
- [ ] **Step 5: Verify in the app:** with a row selected and focus out of inputs, `⌘⌫` stages a delete; typing in the filter box, `⌘⌫` deletes to line start and `⌘F` does nothing harmful; `⌘I` opens the insert drawer; `⌘E` exports CSV; `⌘⇧S` commits staged changes after the existing review flow; `⌘C` still copies grid rows and text selections.
- [ ] **Step 6: Commit** `feat(desktop): grid and pending-change menu commands (phase 3)`.

---

## Phase 4 — Connections, schema and Help

### Task 12: Connection and schema commands

**Files:**
- Modify: `registry.ts`, `menuModel.ts` and tests; `apps/desktop/src/App.tsx`

**Interfaces:**
- Produces commands: `file.newConnection` "New Connection…" `CmdOrCtrl+N` (always); `file.newTable` "New Table…" `CmdOrCtrl+Shift+N` (connection open); `conn.switch` "Switch Connection…" and `conn.back` "Back to Connections" (always while a connection is open; `conn.switch` opens the Navbar connection switcher — add an imperative open trigger to `Navbar.tsx` if none exists, otherwise fall back to `conn.back`); `conn.edit` "Edit Connection…" (connection open); `conn.reconnect` "Reconnect" and `conn.disconnect` "Disconnect" (connection open); `conn.refreshSchema` "Refresh Schema" `CmdOrCtrl+Shift+R` (connection open).
- Handlers: `openNewConnection()`, a `CreateTableDesigner` tab opener (use the same path the sidebar's "new table" action uses — find it with `grep -n CreateTableDesigner src/App.tsx`), `handleBackToConnections`, `openEditConnection(profileOfCurrentDb)`, Reconnect = `connectionsDisconnect` then `handleOpenConnection(currentDbId)` (clear `currentDbId` first so the early-return guard does not skip it), Disconnect = `handleBackToConnections`, Refresh Schema = the existing `onRefreshSchemas` implementation at `App.tsx:1443` extracted into a named function.

- [ ] **Step 1: Write failing tests:** registry rows (connection commands disabled with `connectionOpen: false`, `file.newConnection` always enabled); model snapshot for the `connection` submenu order and the File additions.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** registry, model and `App.tsx` handlers.
- [ ] **Step 4: Run** `bun test` and `bun run lint` — expect PASS.
- [ ] **Step 5: Verify in the app:** `⌘N` opens the connection modal, `⌘⇧R` refreshes schemas, Reconnect restores the same tabs, Disconnect returns to the connection list.
- [ ] **Step 6: Commit** `feat(desktop): connection and schema menu commands`.

### Task 13: Help menu and Keyboard Shortcuts modal

**Files:**
- Create: `apps/desktop/src/lib/commands/shortcutsCheatSheet.ts`, `apps/desktop/src/components/Modals/ShortcutsModal.tsx`
- Test: `apps/desktop/src/lib/commands/shortcutsCheatSheet.test.ts`
- Modify: `registry.ts`, `menuModel.ts` and tests, `apps/desktop/src/App.tsx`; possibly `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/package.json`

**Interfaces:**
- Produces: `cheatSheetRows(model: MenuNode[], platform: Platform): { group: string; rows: { label: string; shortcut: string }[] }[]` — one group per top-level submenu with at least one accelerated command; each accelerated command appears exactly once (nested submenus such as Go to Tab flatten into their parent group). Commands: `help.docs` "Documentation", `help.releaseNotes` "Release Notes", `help.reportIssue` "Report an Issue", `help.shortcuts` "Keyboard Shortcuts…" (all always enabled, `allowInModal` false). A `help` submenu with `role: 'help'` is added to the macOS model (after `window`).
- External links: find how the app opens external URLs today (`grep -rn "https://github.com\|window.open" apps/desktop/src`). Reuse that path. If none exists, add `tauri-plugin-opener` pinned to the version compatible with `tauri =2.2.0` (check `cargo search tauri-plugin-opener` and its `Cargo.toml`), register it in `lib.rs`, add `@tauri-apps/plugin-opener` at the matching pinned version, and add `opener:allow-open-url` to `capabilities/default.json` scoped to the project's GitHub repository and web site URLs only. Any link whose URL cannot be determined from the repo (`README.md`, `package.json`, `tauri.conf.json` updater endpoint) is omitted.

- [ ] **Step 1: Write failing tests** in `shortcutsCheatSheet.test.ts`: every command in `COMMANDS` that has an accelerator appears exactly once across all groups; a command without an accelerator never appears; macOS rows use glyph strings (`'⌘,'` for `app.settings`); group order follows the model order. Update menu-model tests for the Help submenu.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the cheat-sheet function, `ShortcutsModal` (reuse `Modal`/`ModalPanel` from `components/ui/Modal`), the registry and model entries, and the `App.tsx` handlers and `isShortcutsOpen` state (include it in `modalOpen`). Add the opener plugin only if needed per the note above.
- [ ] **Step 4: Run** `bun test`, `bun run lint`, and (if Rust changed) `cargo check -p db-desktop` — expect PASS.
- [ ] **Step 5: Verify in the app:** Help menu shows the macOS search field plus the items; Keyboard Shortcuts… opens a modal listing every accelerator by menu; each link opens in the browser.
- [ ] **Step 6: Commit** `feat(desktop): help menu and keyboard shortcuts reference (phase 4)`.

### Task 14: Final regression pass

**Files:** none (verification only).

- [ ] **Step 1:** Run `cd /Users/migueloliveirabizzi/Projetos/db-manager && bun run test` and `bun run lint` — expect PASS.
- [ ] **Step 2:** In `tauri dev`, walk the spec's success criteria: every menu present; every accelerator shown beside its item; no shortcut conflicts; `⌘C/⌘V/⌘Z` in the editor and inputs; run, refresh, palette, tabs, panes, saved workspace unchanged.
- [ ] **Step 3:** Update `docs/superpowers/plans/2026-10-15-native-menu-bar.md` checkboxes and note any deviations (for example named-key substitutions from Task 6) in the final commit message or a short note at the end of this file.
