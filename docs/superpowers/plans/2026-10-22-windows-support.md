# Windows Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed Windows x64 build of Bizzi DB that looks like the macOS app, follows Windows keyboard and window conventions, and is built, tested and released by GitHub Actions next to the untouched macOS release.

**Architecture:** The command registry stays the single source of shortcuts, with an optional Windows override per command. Off macOS, a webview keyboard listener runs commands through the same gate as the native menu, and the native menu only displays shortcut text. A frameless window with webview-drawn caption buttons keeps the navbar identical. Rust adds single-instance, a menu-bar visibility command and OpenSSL-backed SSH on Windows. CI gains a Windows test job and a signed NSIS release job that runs after the macOS job.

**Tech Stack:** Tauri 2.2.0 (pinned), React 19, TypeScript, Bun test, Rust (MSVC), NSIS, Azure Trusted Signing (`trusted-signing-cli`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-22-windows-support-design.md` (audit, decisions D1–D13, shortcut map). Read it first.

## Global Constraints

- macOS behaviour must not change: no edits to `macos.rs`, the macOS `release.yml` job, `tauri.conf.json` keys that macOS reads, or the macOS menu model. Every macOS test that passes today passes unchanged (only expected lists that gain a new command id change).
- Tauri crates stay pinned (`tauri =2.2.0`, `@tauri-apps/api 2.2.0`). New crates are exact-pinned with `=` and must not move a pinned crate in `Cargo.lock`.
- Never change the bundle id `com.bizzidb.app`, regenerate updater keys, retag, or force-push a tag.
- No unsigned Windows installer is ever published.
- NSIS only, `installMode: "currentUser"`, x64 only; updater `installMode: "passive"`.
- Windows shortcuts are exactly the spec's shortcut map. Reserved on Windows: Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Alt+F4, Alt+Space, F10, F12, Ctrl+Escape.
- Suppressed browser keys on Windows: F3, F5, Shift+F5, Ctrl+F5, Ctrl+R, Ctrl+Shift+R, Ctrl+P, Ctrl+F, Ctrl+G, Ctrl+Shift+G, Ctrl+U, Ctrl+J, Ctrl+=, Ctrl+-, Ctrl+0, Alt+ArrowLeft, Alt+ArrowRight, BrowserRefresh, BrowserBack, BrowserForward; mouse buttons 3 and 4.
- Caption buttons: 46 px wide, full navbar height, close hover `#c42b1c` with white glyph.
- Project rules in `.claude/rules/` apply (TDD, tests next to the unit, comments only for non-obvious why, menu-and-shortcuts checklist, new Tauri commands in `permissions/app.toml`, no shell/fs/http plugins). `bun run test` passes at the end of every task.
- Work on `feat/windows-support` in a worktree off `main`. If `feat/open-source-readiness` has merged, keep its SHA-pinned `uses:` style and its `build` matrix; do not duplicate them. Stage by path; one commit per task.

## Review Focus

1. **Delete key while typing on Windows.** Delete is the Windows shortcut for Delete Selected Rows; in an input or the SQL editor it must still delete text, so a disabled command must never `preventDefault` (Task 2 test `passes a key whose command did not run`).
2. **AltGr typing.** On a German layout AltGr+Q (reported as Ctrl+Alt+Q, key `@`) must type `@` and run nothing (Task 2 test `AltGr characters are not shortcuts`).
3. **F5 / Ctrl+R with no table tab open** must not reload the webview and lose every tab (Task 2 test `suppresses browser reload when no command runs`).
4. **Alt+Tab away and back** must not open the menu (Task 2 test `Alt released after blur is not a tap`).
5. **Non-Latin layouts.** On a Russian layout Ctrl+K reports key `л`; it must still open the palette (Task 2 test `uses the physical key when the layout is not Latin`).

## File Structure

| Path | Responsibility |
|---|---|
| `apps/desktop/src/lib/commands/registry.ts` | `nonMacAccelerator` field, `acceleratorFor`, `view.toggleFullscreen` |
| `apps/desktop/src/lib/commands/reserved.ts` | Per-platform reserved lists |
| `apps/desktop/src/lib/commands/keyboard.ts` (+test) | Pure: event → accelerator, command lookup, keydown decision, suppression set |
| `apps/desktop/src/lib/commands/altTap.ts` (+test) | Pure Alt-tap state machine |
| `apps/desktop/src/lib/commands/menuHost.ts` | Windows item text with `\t` shortcut, no registered accelerators off macOS |
| `apps/desktop/src/lib/commands/platformAdapter.ts` | Swap predefined Full Screen for `view.toggleFullscreen` off macOS |
| `apps/desktop/src/lib/commands/useAppMenu.ts` | `run` returns boolean; installs keyboard + Alt-tap listeners off macOS |
| `apps/desktop/src/lib/windowChrome.ts` (+test) | Caption button model, navbar padding per platform |
| `apps/desktop/src/components/WindowsCaptionButtons.tsx` | Windows minimize/maximize/close |
| `apps/desktop/src/lib/platformCopy.ts` (+test) | Secret-store name per platform |
| `packages/core/src/window/index.ts` | `windowMenuSetVisible` invoke wrapper |
| `apps/desktop/src-tauri/src/lib.rs`, `Cargo.toml` | Single instance, `window_menu_set_visible`, ssh2 OpenSSL on Windows |
| `apps/desktop/src-tauri/tauri.windows.conf.json` | Frameless window, NSIS bundle, updater install mode |
| `apps/desktop/scripts/windowsSignConfig.ts` (+test), `write-windows-sign-config.ts` | CI sign config from repository variables |
| `apps/desktop/scripts/updaterManifest.ts` (+test), `verify-updater-manifest.ts` | Required platforms as a parameter |
| `.gitattributes`, `.github/workflows/test.yml`, `.github/workflows/release.yml` | LF checkout, Windows tests, Windows release |
| `docs/windows-verification.md` | Manual Windows/macOS checklist and results |

---

### Task 1: Per-platform accelerators

**Files:**
- Modify: `apps/desktop/src/lib/commands/registry.ts`, `reserved.ts`, `shortcutLabel.ts`, `shortcutsCheatSheet.ts`, `apps/desktop/src/lib/editorKeymap.ts`, `apps/desktop/src/App.tsx` (handler)
- Test: `registry.test.ts`, `shortcutsCheatSheet.test.ts`, `apps/desktop/src/lib/editorKeymap.test.ts`

**Interfaces:**
- Produces: `Command.nonMacAccelerator?: string` (used on Windows and Linux); `acceleratorFor(cmd: Command, platform: Platform): string | undefined` (non-mac override, else `accelerator`; macOS always `accelerator`); `reservedAccelerators(platform: Platform): readonly string[]`; command `view.toggleFullscreen` (label `Full Screen`, no macOS accelerator, `nonMacAccelerator: 'F11'`, enabled always, `allowInModal: false`).

- [ ] **Step 1: Write failing tests** in `registry.test.ts`:
  - `windows shortcut map matches the spec`: for each row, `formatAccelerator(acceleratorFor(commandById(id), 'windows')!, 'windows')` equals: `edit.deleteRows` → `Delete`, `conn.refreshTable` → `F5`, `conn.refreshSchema` → `Ctrl+F5`, `view.nextTab` → `Ctrl+Tab`, `view.prevTab` → `Ctrl+Shift+Tab`, `view.toggleFullscreen` → `F11`, `file.newView` → `Ctrl+Alt+V`, `query.run` → `Ctrl+Enter`, `view.tab.9` → `Ctrl+9`.
  - `macOS accelerators are unchanged`: `acceleratorFor(commandById('edit.deleteRows'), 'macos')` is `CmdOrCtrl+Backspace`; `acceleratorFor(commandById('view.toggleFullscreen'), 'macos')` is `undefined`.
  - Make the existing uniqueness and reserved tests loop over `['macos', 'windows', 'linux']` using `acceleratorFor` and `reservedAccelerators(platform)`.
  - `windows reserved list`: `reservedAccelerators('windows').map(normalizeAccelerator)` contains `normalizeAccelerator('Alt+F4')`, `'CmdOrCtrl+Y'`, `'F10'`, `'F12'`, `'Alt+Space'`, `'CmdOrCtrl+Escape'`.
  - Add `view.toggleFullscreen` to the expected id list.
  - `shortcutsCheatSheet.test.ts`: for `adaptMenuModel(buildMenuModel(), 'windows')`, the Edit group has `{ label: 'Delete Selected Rows', shortcut: 'Delete' }` and the View group has `{ label: 'Full Screen', shortcut: 'F11' }`.
  - `editorKeymap.test.ts`: `menuKeyCollisions(BASIC_SETUP_KEYMAP, 'windows')` equals `[]`.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/commands src/lib/editorKeymap.test.ts`. Expected: FAIL (`acceleratorFor` not exported).
- [ ] **Step 3: Implement.** Add the field, `acceleratorFor`, the overrides from the spec map, and `view.toggleFullscreen`. `reserved.ts`: keep `RESERVED_ACCELERATORS` (macOS) and add the Windows list from Global Constraints; `reservedAccelerators` returns the macOS list on macOS and the Windows list otherwise. Replace every `cmd.accelerator` read in `shortcutLabel.ts`, `shortcutsCheatSheet.ts` and `editorKeymap.ts#menuKeys` with `acceleratorFor(cmd, platform)`. Add the `view.toggleFullscreen` handler in `App.tsx` (`getCurrentWindow()`: `setFullscreen(!(await isFullscreen()))`).
- [ ] **Step 4: Run** the same command, then `bun run test`. Expected: PASS (`handlerWiring.test.ts` included).
- [ ] **Step 5: Commit** `feat(desktop): per-platform shortcuts with Windows overrides`.

---

### Task 2: Keyboard dispatch and Alt-tap logic (pure)

**Files:**
- Create: `apps/desktop/src/lib/commands/keyboard.ts`, `keyboard.test.ts`, `altTap.ts`, `altTap.test.ts`

**Interfaces:**
- Consumes: `acceleratorFor`, `COMMANDS`, `normalizeAccelerator`, `Platform`.
- Produces:
  - `interface KeyEventLike { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean; defaultPrevented?: boolean }`
  - `acceleratorFromEvent(e: KeyEventLike, platform: Platform): string | null` — normalized (`normalizeAccelerator` form) or `null`.
  - `commandForAccelerator(acc: string, platform: Platform, commands?: readonly Command[]): Command | undefined`
  - `SUPPRESSED_BROWSER_KEYS: ReadonlySet<string>` (normalized, from Global Constraints)
  - `decideKeydown(e: KeyEventLike, platform: Platform, run: (commandId: string) => boolean): 'ran' | 'suppressed' | 'pass'` — caller calls `preventDefault()` unless `'pass'`.
  - `isNavigationMouseButton(button: number): boolean` (3 or 4)
  - `createAltTapTracker(): { keyDown(key: string): void; keyUp(key: string): boolean; interrupt(): void }` — `keyUp('Alt')` returns `true` only for a clean tap; `interrupt()` is called on pointer down and window blur.

Algorithm for `acceleratorFromEvent` (the tests pin it):
1. Bare modifiers (`Control`, `Shift`, `Alt`, `Meta`, `AltGraph`) → `null`. Off macOS, `metaKey` (Windows key) → `null`.
2. Modifiers: macOS `cmd = metaKey`, `ctrl = ctrlKey`; elsewhere `cmd = ctrlKey`, `ctrl = false`.
3. Base key: `code` `KeyA`–`KeyZ` → `key` upper-cased if `key` is a single Latin letter, else the letter from `code`; `Digit0`–`Digit9` → the digit; punctuation by `code` (`Comma ,` `Period .` `Slash /` `Backslash \` `BracketLeft [` `BracketRight ]` `Backquote` `` ` `` `Minus -` `Equal =` `Semicolon ;` `Quote '`); `NumpadEnter` → `Enter`; otherwise named keys and `F1`–`F24` from `key`.
4. AltGr guard: if `ctrlKey && altKey`, `key` is one character, and it is neither the base key nor its lower case → `null`.

`decideKeydown`: `pass` when `defaultPrevented` or `isComposing` or no accelerator; if a command matches and `run(id)` returns `true` → `ran`; else if the accelerator is in `SUPPRESSED_BROWSER_KEYS` → `suppressed`; else `pass`.

- [ ] **Step 1: Write failing tests** (`keyboard.test.ts`), with a helper `ev(partial)` defaulting every flag to `false`:
  - `maps Ctrl+Shift+N on Windows`: `{key:'N', code:'KeyN', ctrlKey, shiftKey}` → `'CmdOrCtrl+Shift+N'`.
  - `maps Cmd on macOS and ignores Ctrl as Cmd`: `{key:'k', code:'KeyK', metaKey}` on `macos` → `'CmdOrCtrl+K'`; `{key:'k', code:'KeyK', ctrlKey}` on `macos` → `'Ctrl+K'`.
  - `shifted punctuation uses the physical key`: `{key:'}', code:'BracketRight', ctrlKey, shiftKey}` → `'CmdOrCtrl+Shift+]'`.
  - `uses the physical key when the layout is not Latin`: `{key:'л', code:'KeyK', ctrlKey}` → `'CmdOrCtrl+K'`.
  - `AltGr characters are not shortcuts`: `{key:'@', code:'KeyQ', ctrlKey, altKey}` → `null`; `{key:'v', code:'KeyV', ctrlKey, altKey}` → `'CmdOrCtrl+Alt+V'`.
  - `Windows key and bare modifiers are ignored`: `{key:'k', code:'KeyK', metaKey}` on `windows` → `null`; `{key:'Control', code:'ControlLeft', ctrlKey}` → `null`.
  - `function and named keys`: `{key:'F5', code:'F5'}` → `'F5'`; `{key:'Delete', code:'Delete'}` → `'DELETE'`; `{key:'Tab', code:'Tab', ctrlKey, shiftKey}` → `'CmdOrCtrl+Shift+TAB'`; `{key:'Enter', code:'NumpadEnter', ctrlKey}` → `'CmdOrCtrl+ENTER'`.
  - `runs the command`: Ctrl+K with `run` returning `true` → `'ran'` and `run` called with `'view.palette'`.
  - `passes a key whose command did not run`: `{key:'Delete', code:'Delete'}` with `run` returning `false` → `'pass'`.
  - `suppresses browser reload when no command runs`: F5 and Ctrl+R with `run` returning `false` → `'suppressed'`; Ctrl+P → `'suppressed'`; Alt+ArrowLeft → `'suppressed'`.
  - `respects editor handling`: Ctrl+F with `defaultPrevented: true` → `'pass'` and `run` not called.
  - `isNavigationMouseButton`: `3` and `4` true; `0`, `1`, `2` false.
- [ ] **Step 2: Write failing tests** (`altTap.test.ts`):
  - `clean tap`: `keyDown('Alt')`, `keyUp('Alt')` → `true`.
  - `chord is not a tap`: `keyDown('Alt')`, `keyDown('F4')`, `keyUp('Alt')` → `false`.
  - `Alt released after blur is not a tap`: `keyDown('Alt')`, `interrupt()`, `keyUp('Alt')` → `false`.
  - `click during Alt is not a tap`: same with `interrupt()` standing for pointer down → `false`.
  - `repeat keydown of Alt still a tap`: `keyDown('Alt')` ×3, `keyUp('Alt')` → `true`.
- [ ] **Step 3: Run** `bun --cwd apps/desktop test src/lib/commands/keyboard.test.ts src/lib/commands/altTap.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** both modules per the interfaces and algorithm above.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(desktop): keyboard dispatch and Alt-tap logic for Windows`.

---

### Task 3: Rust and Tauri config for Windows

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`, `src/lib.rs`, `src/ssh_tunnel.rs`, `permissions/app.toml`
- Create: `apps/desktop/src-tauri/tauri.windows.conf.json`, `packages/core/src/window/index.ts` (export it from `packages/core/src/index.ts` like the other modules)

**Interfaces:**
- Produces: Tauri command `window_menu_set_visible(window: tauri::WebviewWindow, visible: bool) -> Result<(), String>` (calls `show_menu`/`hide_menu` on Windows and Linux, `Ok(())` on macOS); TS `windowMenuSetVisible(visible: boolean): Promise<void>` invoking it with `{ visible }`.

- [ ] **Step 1: Write the failing Rust test** in `ssh_tunnel.rs`:

```rust
#[test]
fn ssh_backend_supports_ed25519_host_keys() {
    let session = ssh2::Session::new().unwrap();
    let algs = session.supported_algs(ssh2::MethodType::HostKey).unwrap();
    assert!(algs.contains(&"ssh-ed25519"), "{algs:?}");
}
```

- [ ] **Step 2: Run** `bun --cwd apps/desktop run build && cargo test -p db-desktop --locked ssh_backend`. On macOS: PASS (guards the macOS backend). It is the Windows failure test once Task 7 runs it on `windows-latest`; record that it fails there before Step 4 if a Windows machine is available.
- [ ] **Step 3: Write the failing IPC check.** Add `window_menu_set_visible` to `generate_handler!` with a stub body; run `bun --cwd apps/desktop test src/lib/ipcPermissions.test.ts`. Expected: FAIL (`window_menu_set_visible` not allowed).
- [ ] **Step 4: Implement.**
  - `Cargo.toml`: `[target.'cfg(windows)'.dependencies] ssh2 = { version = "=0.9.4", features = ["vendored-openssl", "openssl-on-win32"] }`; `[target.'cfg(any(target_os = "windows", target_os = "linux"))'.dependencies] tauri-plugin-single-instance = "=<v>"` where `<v>` is the newest release whose `tauri` requirement accepts `2.2.0` (`cargo info tauri-plugin-single-instance@<v>`); `cargo update -p tauri-plugin-single-instance --precise <v>` must leave every other pinned version in `Cargo.lock` unchanged (`git diff Cargo.lock` shows only additions).
  - `lib.rs`: register the single-instance plugin first on those targets; its callback shows, unminimizes and focuses `main`. Implement `window_menu_set_visible` and add it to `app.toml`.
  - `tauri.windows.conf.json`: `bundle.targets: ["nsis"]`, `bundle.windows.nsis.installMode: "currentUser"`, `bundle.windows.nsis.installerIcon: "icons/icon.ico"`, `plugins.updater.windows.installMode: "passive"`. Window decorations are added in Task 5.
  - `packages/core/src/window/index.ts`: the one-line wrapper.
- [ ] **Step 5: Run** `bun run test` and `cargo test -p db-desktop --locked`. Expected: PASS. Run `cargo tree -p db-desktop --target x86_64-pc-windows-msvc -i openssl-sys` and confirm it lists `libssh2-sys`.
- [ ] **Step 6: Commit** `feat(desktop): single instance, menu visibility and OpenSSL SSH on Windows`.

---

### Task 4: Windows menu and keyboard wiring

**Files:**
- Modify: `apps/desktop/src/lib/commands/menuHost.ts`, `platformAdapter.ts`, `useAppMenu.ts`
- Test: `menuHost.test.ts`, `menuModel.test.ts`, `useAppMenu.test.ts`

**Interfaces:**
- Consumes: `acceleratorFor`, `formatAccelerator`, `decideKeydown`, `isNavigationMouseButton`, `createAltTapTracker`, `windowMenuSetVisible`.
- Produces: `menuItemText(label: string, accelerator: string | undefined, platform: Platform): string` (macOS → `label`; else `label + '\t' + formatAccelerator(acc, platform)` when there is one); `MenuSync.run(commandId): boolean` (true when the command ran); `installKeyboard(opts: { platform: Platform; target: Pick<Window, 'addEventListener' | 'removeEventListener'>; run(id: string): boolean; onAltTap(): void }): () => void`.

- [ ] **Step 1: Write failing tests.**
  - `menuHost.test.ts`: on `windows`, the fake `MenuItem.new` for `file.newTable` receives `{ text: 'New Table…\tCtrl+Shift+N' }` and no `accelerator` key; `applyState` with label `Run Selection` for `query.run` calls `setText('Run Selection\tCtrl+Enter')`. On `macos`, `file.newTable` still receives `accelerator: 'CmdOrCtrl+Shift+N'` and `text: 'New Table…'`.
  - `menuModel.test.ts`: the Windows-adapted View submenu contains `{ kind: 'item', commandId: 'view.toggleFullscreen' }` and no `predefined: 'fullscreen'`; the macOS model is unchanged.
  - `useAppMenu.test.ts`: `createMenuSync(...).run(id)` returns `true` for an enabled command with a handler and `false` for a disabled one. `installKeyboard` with a fake target: dispatching a Ctrl+K keydown calls `preventDefault` and `run('view.palette')`; a `Delete` keydown whose `run` returns `false` does not call `preventDefault`; a `mouseup` with `button: 3` calls `preventDefault`; Alt down/up calls `onAltTap` once; the returned function removes every listener.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/commands`. Expected: FAIL.
- [ ] **Step 3: Implement.** `buildNode` uses `menuItemText` and passes `accelerator` only on macOS; `BuildContext.items` keeps each item's accelerator so `applyState` re-suffixes labels. `adaptMenuModel` replaces `predefined('fullscreen')` with `item('view.toggleFullscreen')` off macOS. `installKeyboard` listens to `keydown` (bubble), `keyup`, `mousedown`, `mouseup`, `blur`. In `useAppMenu`, off macOS: after `installMenu` resolves, call `windowMenuSetVisible(false)`, then `installKeyboard` with `run: menu.run` and `onAltTap` toggling a local `visible` flag through `windowMenuSetVisible`.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): Windows menu text, keyboard dispatch and Alt menu toggle`.

---

### Task 5: Windows title bar

**Files:**
- Create: `apps/desktop/src/lib/windowChrome.ts`, `windowChrome.test.ts`, `apps/desktop/src/components/WindowsCaptionButtons.tsx`
- Modify: `apps/desktop/src/components/Navbar.tsx`, `WindowControls.tsx`, `apps/desktop/src/lib/windowDrag.ts`, `windowDrag.test.ts`, `apps/desktop/src-tauri/tauri.windows.conf.json`

**Interfaces:**
- Produces: `type CaptionAction = 'minimize' | 'maximize' | 'restore' | 'close'`; `captionButtons(maximized: boolean): { action: CaptionAction; label: string }[]`; `navbarPadding(platform: Platform): string`; `handleTitlebarMouseDown(event, startDrag: () => void, toggleMaximize?: () => void): void`.

- [ ] **Step 1: Write failing tests.**
  - `windowChrome.test.ts`: `captionButtons(false)` → `[{minimize,'Minimize'},{maximize,'Maximize'},{close,'Close'}]`; `captionButtons(true)` middle is `{restore,'Restore Down'}`. `navbarPadding('macos')` → `'pl-24 pr-4'`; `navbarPadding('windows')` → `'pl-4 pr-0'`.
  - `windowDrag.test.ts`: a `detail: 2` mousedown on a child of a drag region calls `toggleMaximize` once and not `startDrag`; on the drag-region element itself it calls neither (Tauri's own handler toggles it); without `toggleMaximize` a double click does nothing (macOS unchanged).
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/windowChrome.test.ts src/lib/windowDrag.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `WindowsCaptionButtons` renders `captionButtons(maximized)` with `data-no-drag`, tracks `maximized` via `onResized` + `isMaximized()`, and maps actions to `minimize()`, `toggleMaximize()`, `close()`; sizes and colours from Global Constraints, glyphs as 10 px 1 px-stroke SVGs in `currentColor`, other hovers `bg-foreground/10`. `Navbar` uses `navbarPadding(currentPlatform())`, renders `WindowControls` (macOS) or `WindowsCaptionButtons` (Windows) as the header's last child, and passes `toggleMaximize` off macOS. `WindowControls` uses `currentPlatform()` instead of its own regex. `tauri.windows.conf.json`: `app.windows` gets the full `main` entry from `tauri.conf.json` without `titleBarStyle`/`hiddenTitle` and with `"decorations": false` (merge patch replaces arrays, so every key is repeated).
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): frameless Windows title bar with caption buttons`.

---

### Task 6: Platform copy

**Files:**
- Create: `apps/desktop/src/lib/platformCopy.ts`, `platformCopy.test.ts`
- Modify: `components/SqlEditor/QueryResultsView.tsx`, `components/WorkspaceEmptyState.tsx`, `lib/dataExport.ts`, `lib/dataExport.test.ts`, `components/DataExport/DataExportMenu.tsx`, `components/Modals/SettingsModal.tsx`, `components/Modals/ConnectionModal.tsx`

**Interfaces:**
- Produces: `secretStoreName(platform: Platform): string` (`macos`/`linux` → `'system keychain'`, `windows` → `'Windows Credential Manager'`); `copyCsvShortcut(platform?: Platform): string` in `lib/dataExport.ts`, replacing `COPY_CSV_SHORTCUT` (its one caller is `DataExportMenu.tsx`).

- [ ] **Step 1: Write failing test** `platformCopy.test.ts` for the three platforms; in `dataExport.test.ts` assert `copyCsvShortcut('windows')` is `'Ctrl+C'` and `copyCsvShortcut('macos')` is `'⌘C'`.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/platformCopy.test.ts src/lib/dataExport.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace `COPY_CSV_SHORTCUT` with `copyCsvShortcut(platform = currentPlatform())` built from `formatAccelerator('CmdOrCtrl+C', platform)`; `WorkspaceEmptyState` uses `shortcutLabel('view.palette')`; `QueryResultsView` text becomes `Run a SQL query above (${shortcutLabel('query.run')}) to view execution results.`; the Settings label (first letter capitalised, so macOS still reads "System keychain") and the two ConnectionModal strings ("…requires the {name}.", button "Enable {name}") use `secretStoreName`. No other user-agent sniffing remains: `grep -rn "Mac|iPhone" apps/desktop/src --include='*.ts*'` returns only `shortcutLabel.ts`.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(desktop): platform-correct shortcut and keychain copy`.

---

### Task 7: Windows CI

**Files:**
- Create: `.gitattributes`
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: `.gitattributes`** with `* text=auto eol=lf`. Run `git add --renormalize . && git status --short`. Expected: only `.gitattributes` staged (the repo is already LF).
- [ ] **Step 2: Add job `unit-windows`** (`runs-on: windows-latest`): checkout; setup-bun `1.3.11`; rust stable; `ilammy/setup-nasm@v1`; `Swatinem/rust-cache@v2`; `bun install --frozen-lockfile`; `bun run test`; `bun --cwd apps/desktop run build`; `cargo test -p db-desktop --locked`. Same action-pinning style as the rest of the file.
- [ ] **Step 3: Push the branch, open a draft PR, bind it with the `ccd_pr` tools.** Expected: `unit-windows` passes, including `ssh_backend_supports_ed25519_host_keys`. A failure caused by CRLF, path separators or shell syntax is fixed at its source with a regression test in the failing module, not skipped.
- [ ] **Step 4: Commit** `ci: run unit and desktop tests on Windows`.

---

### Task 8: Signed Windows release

**Files:**
- Create: `apps/desktop/scripts/windowsSignConfig.ts`, `windowsSignConfig.test.ts`, `write-windows-sign-config.ts`
- Modify: `apps/desktop/scripts/updaterManifest.ts`, `updaterManifest.test.ts`, `verify-updater-manifest.ts`, `.github/workflows/release.yml`, `SECURITY.md`, `RELEASING.md`, `.cursor/rules/cut-release.mdc`

**Interfaces:**
- Produces: `windowsSignConfig(env: Record<string, string | undefined>): { ok: true; config: object } | { ok: false; errors: string[] }` reading `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`; CLI `bun write-windows-sign-config.ts <out.json>` (exit 1 with one `::error::` per problem); `DARWIN_PLATFORMS`, `WINDOWS_PLATFORMS = ['windows-x86_64']`; `validateUpdaterManifest(manifest, tag, required: readonly string[] = DARWIN_PLATFORMS)`; CLI optional third argument, a comma-separated platform list.

- [ ] **Step 1: Write failing tests.**
  - `windowsSignConfig.test.ts`: valid env → `config` deep-equals `{ bundle: { windows: { signCommand: { cmd: 'trusted-signing-cli', args: ['-e', endpoint, '-a', account, '-c', profile, '-d', 'Bizzi DB', '%1'] } } } }`; each missing variable → an error naming it; endpoint `http://eus.codesigning.azure.net` or `https://evil.example` → error (must match `^https://[a-z0-9-]+\.codesigning\.azure\.net/?$`).
  - `updaterManifest.test.ts`: a manifest with only `darwin-*` passes with the default list and fails with `[...DARWIN_PLATFORMS, ...WINDOWS_PLATFORMS]` with `platform windows-x86_64 is missing`.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test scripts`. Expected: FAIL.
- [ ] **Step 3: Implement** the scripts.
- [ ] **Step 4: Run** `bun --cwd apps/desktop test scripts`. Expected: PASS.
- [ ] **Step 5: Add `publish-windows` to `release.yml`** with `needs: publish`, `runs-on: windows-latest`, and the macOS job left byte-identical. Steps: checkout; setup-bun `1.3.11`; rust stable; setup-nasm; `cargo install trusted-signing-cli --locked --version <v>` (`<v>` = newest from `cargo search trusted-signing-cli --limit 1`, pinned in the file); `bun install --frozen-lockfile`; `bun apps/desktop/scripts/write-windows-sign-config.ts "$RUNNER_TEMP/windows-sign.conf.json"` with the three `vars.AZURE_SIGNING_*`; `tauri-action` with `TAURI_SIGNING_*` and `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` env, the same `projectPath`, `tagName`, `releaseName`, `releaseBody` as the macOS job, `includeUpdaterJson: true`, `args: --config ${{ runner.temp }}/windows-sign.conf.json`; then `bun apps/desktop/scripts/verify-updater-manifest.ts <tag> <repo> darwin-aarch64,darwin-x86_64,windows-x86_64`; then download the published `*-setup.exe` with `gh release download` and fail unless `(Get-AuthenticodeSignature $exe).Status -eq 'Valid'` (pwsh). The steps that use `$RUNNER_TEMP` run with `shell: bash`.
- [ ] **Step 6: Validate YAML** with `bun -e "Bun.YAML.parse(await Bun.file('.github/workflows/release.yml').text())"`. Expected: exit 0.
- [ ] **Step 7: Docs.** `SECURITY.md`: replace the "Windows Authenticode secrets are unused" line with the three Azure secrets and three variables, and note that on Windows the app-data folder relies on the user-profile ACL instead of `0700`/`0600`. `RELEASING.md` step 4 and `cut-release.mdc` step 6: the run has two jobs; macOS publishes first; a failed `publish-windows` is re-run with **Re-run failed jobs**, never by retagging. Add the spec's one-time maintainer setup to `RELEASING.md`.
- [ ] **Step 8: Commit** `ci: signed Windows installer in the release workflow`.

---

### Task 9: Manual verification on Windows and macOS

**Files:**
- Create: `docs/windows-verification.md` (checklist with a result column; filled in, committed)

Needs a Windows 11 machine and a Windows 10 22H2 VM, plus the maintainer's Mac. Use a prerelease tag (`v<next>-rc.1`, marked prerelease per `RELEASING.md`) so installed apps are not offered it. Creating the tag needs the maintainer's go-ahead.

- [ ] **Step 1: Install** the prerelease `*-setup.exe`. Expected: no SmartScreen "unknown publisher" warning; publisher shows the Azure identity; no admin prompt; Start menu entry "Bizzi DB".
- [ ] **Step 2: Window.** One header only; caption buttons right; hover colours; double-click title toggles maximize; drag; Aero Snap; resize from every edge; Win+↑/↓; close exits the process.
- [ ] **Step 3: Keyboard.** Every row of the spec's shortcut map, with focus in the grid, in the SQL editor and in a text input. F5/Ctrl+R/Ctrl+P/Alt+← with no table open do nothing. Delete in a text input deletes text. German keyboard layout: AltGr+Q types `@` in the SQL editor. Alt tap opens the menu under the title bar; menu items show right-aligned shortcuts; Alt+Tab does not open it.
- [ ] **Step 4: Integrations.** Second launch focuses the existing window. Save a connection with "system keychain" on → entry visible in Credential Manager. SSH tunnel with an Ed25519 key picked through the file dialog. Updater: install the previous prerelease, publish the next, accept the update → passive install and relaunch.
- [ ] **Step 5: macOS regression pass** on the same prerelease: traffic lights, ⌘ shortcuts from the map, menu bar, close-to-Dock, DMG install, update.
- [ ] **Step 6: Commit** the filled checklist `docs: Windows verification results`. Any failure becomes a bug fix with a reproducing test before Task 10.

---

### Task 10: Announce Windows availability

Only after a non-prerelease release has a signed Windows installer and `latest.json` lists `windows-x86_64`.

**Files:**
- Modify: `README.md`, `apps/web/src/lib/site.ts`, `site.test.ts`, `apps/web/src/components/DownloadButtons.tsx`, `CHANGELOG`/`changelog.ts` (whichever is the source on `main`)

**Interfaces:**
- Produces: `DownloadPlatformId = 'macos' | 'windows'`; `detectPreferredPlatform(userAgent: string): DownloadPlatformId` (`'windows'` when the UA contains `Windows`, else `'macos'`).

- [ ] **Step 1: Write failing tests** in `site.test.ts`: `DOWNLOAD_PLATFORMS` has length 2 with ids `['macos', 'windows']`, Windows `label: 'Windows'`, `detail: 'x64 installer'`, `href: RELEASES_URL`; `detectPreferredPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')` → `'windows'`; a macOS UA → `'macos'`. The existing banned-word test stays (copy must not say "NSIS" or "winget").
- [ ] **Step 2: Run** `bun --cwd apps/web test`. Expected: FAIL.
- [ ] **Step 3: Implement**; the Windows icon is lucide `Monitor`. README: badge `Platform-macOS%20%7C%20Windows`; install table Windows row "Download the x64 installer and run it. It installs for your user only; no administrator rights needed."; Linux row "Not available yet."; add the Windows prerequisites from the spec to the development section. Changelog entry for the release.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: announce Windows support`.
