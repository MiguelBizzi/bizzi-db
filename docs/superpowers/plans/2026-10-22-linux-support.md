# Linux Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Bizzi DB on Linux x86_64 as `.deb` and AppImage, looking like macOS and Windows, with Linux shortcuts, window chrome, Secret Service handling and in-app updates, built and released by GitHub Actions after the untouched macOS and Windows jobs.

**Architecture:** Rust tells the webview its platform through an init script. The registry gains a Linux accelerator override and a Linux reserved list on top of the existing non-macOS keyboard dispatcher. A frameless Linux window gets webview-drawn caption buttons and resize handles. Rust adds desktop identity, an NVIDIA WebKit workaround, a keyring probe and an install-kind update channel. CI gains Linux desktop tests and a `publish-linux` job that smoke-tests, checksums and GPG-signs before the assets stay published.

**Tech Stack:** Tauri 2.2.0 (pinned), WebKitGTK 4.1, React 19, TypeScript, Bun test, Rust, `keyring =2.3.3` (Secret Service over zbus), `tauri-plugin-updater =2.2.0`, tauri-action v1.0.0, GitHub Actions `ubuntu-22.04`, Xvfb, GnuPG.

**Spec:** `docs/superpowers/specs/2026-10-22-linux-support-design.md` (audit L1–L12, decisions 1–11, Linux shortcut map, reserved list). Read it first, then the Windows spec it builds on.

## Global Constraints

- Base: `origin/main` (v0.1.20, Windows support merged). The local `main` is stale; branch `feat/linux-support` in a worktree off `origin/main`. One commit per task, staged by path, DCO `Signed-off-by` on every commit (CI checks it).
- macOS and Windows behaviour must not change: no edits to `macos.rs`, the `publish` or `publish-windows` jobs, `tauri.windows.conf.json`, or `tauri.conf.json` keys those platforms read. Existing macOS/Windows test expectations stay as they are; only lists that gain a new command id change.
- Tauri crates stay pinned (`tauri =2.2.0`, `tauri-runtime(-wry) =2.3.0`, `@tauri-apps/api 2.2.0`, `tauri-plugin-updater =2.2.0`). New crates are exact-pinned to the version already in `Cargo.lock` (`glib = "=0.18.5"`); `git diff Cargo.lock` must show no version moves.
- Never change the bundle id `com.bizzidb.app`, regenerate updater keys, retag, or force-push a tag.
- Phase 1 formats: `.deb` and AppImage, x86_64 only, built on `ubuntu-22.04`. No rpm, Flatpak, Snap or arm64.
- Linux shortcuts and reserved list are exactly the spec's tables. `acceleratorFor` precedence on Linux: `linuxAccelerator` → `nonMacAccelerator` → `accelerator`.
- Linux caption buttons: 24 px circles, 8 px gap, 8 px right margin, hover `bg-foreground/10`, Windows glyphs, no red close. Resize handles: 4 px edges, 8 px corners, absent when maximized or full screen.
- Copy: Linux store name `system keyring`; long name `Secret Service keyring (GNOME Keyring or KWallet)`; non-updatable copy text: `This copy of Bizzi DB was not installed from the AppImage or the .deb package, so it cannot update itself. Download the latest version from the releases page.`
- Project rules in `.claude/rules/` apply (TDD, tests next to the unit, comments only for non-obvious why, menu-and-shortcuts checklist, new Tauri commands in `permissions/app.toml`, no shell/fs/http plugins, no SQL or secrets in logs). `bun run test` passes at the end of every task; Rust tasks also pass `cargo test -p db-desktop --locked` and `cargo test -p db-storage --locked`.

## Review Focus

1. **Keyring disappears after it was enabled** (session started over SSH, i3 without gnome-keyring, locked KWallet): saving or connecting must fail with the readable keyring message, never a raw `org.freedesktop.DBus.Error…` string; and turning the setting on with zero saved connections must be refused when the probe fails (Task 5 tests `enabling keychain is refused when unavailable even with no connections`, `keyring errors read as one message`).
2. **`.deb` user accepts an update**: the plugin must download the `.deb`, not the AppImage (Task 6 test `deb install updates through the deb key`).
3. **Copy run from a tarball or `cargo run --release`**: no background check ever starts and a manual check shows the non-updatable copy instead of trying to overwrite the binary (Task 6 tests `other install never self-updates`, `manual check without self-update explains why`).
4. **Maximized window**: resize handles must not exist, or they steal clicks from the close button and the grid scrollbar at the screen edge (Task 3 test `no handles while maximized or full screen`).
5. **User set `WEBKIT_DISABLE_DMABUF_RENDERER=0` on an NVIDIA machine**: their value wins (Task 4 test `user value is never overridden`).

## File Structure

| Path | Responsibility |
|---|---|
| `apps/desktop/src-tauri/src/platform.rs` | Platform init-script plugin; Linux pre-start setup (program name, WebKit env) |
| `apps/desktop/src-tauri/src/update_channel.rs` | Install-kind detection and `app_update_channel` command |
| `apps/desktop/src-tauri/linux/bizzi-db.desktop` | Desktop entry template |
| `apps/desktop/src-tauri/tauri.linux.conf.json` | Frameless window, bundle targets and Linux bundle metadata |
| `crates/storage/src/secrets.rs` | `KeychainSecrets::probe`, `keychain_error_message` |
| `apps/desktop/src-tauri/src/lib.rs` | Plugin registration, `keychain_available`, `settings_save` gate, error mapping |
| `apps/desktop/src/lib/commands/{registry,reserved,platformAdapter,shortcutLabel}.ts` | Linux accelerators, reserved list, `app.quit`, platform source |
| `apps/desktop/src/lib/windowChrome.ts` | Linux caption buttons, padding, `resizeEdges` |
| `apps/desktop/src/components/LinuxCaptionButtons.tsx`, `ResizeHandles.tsx` | Linux window chrome |
| `apps/desktop/src/lib/platformCopy.ts`, `appUpdate.ts`, `App.tsx`, `Modals/SettingsModal.tsx` | Copy, update flow, keyring toggle |
| `apps/desktop/scripts/linuxBundle.ts`, `verify-linux-bundle.ts`, `updaterManifest.ts` | Package and manifest checks |
| `.github/workflows/test.yml`, `release.yml` | `unit-linux`, `publish-linux`, `smoke-linux-distros` |
| `docs/linux-verification.md`, README, `RELEASING.md`, `SECURITY.md`, `apps/web/src/lib/site.ts` | QA record and docs |

---

### Task 1: Platform from Rust

**Files:**
- Create: `apps/desktop/src-tauri/src/platform.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (`mod platform;`, register plugin), `apps/desktop/src/lib/commands/shortcutLabel.ts`
- Test: `platform.rs` `#[cfg(test)]`, `apps/desktop/src/lib/commands/shortcutLabel.test.ts` (create)

**Interfaces:**
- Produces: `pub fn platform_init_script(os: &str) -> Option<String>` (`"macos" | "windows" | "linux"` → `Some("window.__BIZZI_PLATFORM__=\"<os>\";")`, else `None`); `pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R>` (plugin name `"bizzi-platform"`, `js_init_script` from `std::env::consts::OS`); TS `currentPlatform()` unchanged signature, reads `globalThis.__BIZZI_PLATFORM__` first.

- [ ] **Step 1: Write failing tests.** Rust: `init_script_names_known_platforms` (`platform_init_script("linux")` equals `Some("window.__BIZZI_PLATFORM__=\"linux\";".into())`; same for `macos`, `windows`); `init_script_skips_unknown` (`"freebsd"` → `None`). TS `shortcutLabel.test.ts`: `injected platform wins over the user agent` (set `globalThis.__BIZZI_PLATFORM__ = 'linux'`, stub `navigator.userAgent` to a `Macintosh` UA → `currentPlatform()` is `'linux'`); `invalid injected value falls back` (`'beos'` → existing UA logic); `bun default stays macos` (no global → `'macos'`). Clean the global up in `afterEach`.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/commands/shortcutLabel.test.ts` and `cargo test -p db-desktop --locked platform` (after `bun --cwd apps/desktop run build`). Expected: FAIL (missing function / module).
- [ ] **Step 3: Implement** `platform.rs` and the plugin (`tauri::plugin::Builder::new("bizzi-platform").js_init_script(...)`), registered in `run()` right after the single-instance plugin. `currentPlatform()` accepts only the three `Platform` values from the global. Add a one-line comment that WebKitGTK's user agent cannot be trusted to name Linux.
- [ ] **Step 4: Run** the Step 2 commands, then `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): take the platform from Rust instead of the user agent`.

---

### Task 2: Linux shortcuts and Quit

**Files:**
- Modify: `apps/desktop/src/lib/commands/registry.ts`, `reserved.ts`, `platformAdapter.ts`, `apps/desktop/src/App.tsx` (handler)
- Test: `registry.test.ts`, `menuModel.test.ts`, `shortcutsCheatSheet.test.ts`, `apps/desktop/src/lib/editorKeymap.test.ts`, `menuHost.test.ts`

**Interfaces:**
- Consumes: `acceleratorFor`, `reservedAccelerators`, `adaptMenuModel`.
- Produces: `Command.linuxAccelerator?: string`; `LINUX_RESERVED_ACCELERATORS: readonly string[]` (spec list); `reservedAccelerators('linux')` returns it; command `app.quit` (label `Quit`, `linuxAccelerator: 'CmdOrCtrl+Q'`, no other accelerator, enabled always, `allowInModal: true`); `conn.refreshSchema` gains `linuxAccelerator: 'CmdOrCtrl+Shift+R'`.

- [ ] **Step 1: Write failing tests.**
  - `registry.test.ts` `linux shortcut map matches the spec`: `formatAccelerator(acceleratorFor(commandById(id), 'linux')!, 'linux')` gives `conn.refreshSchema` → `Ctrl+Shift+R`, `app.quit` → `Ctrl+Q`, `conn.refreshTable` → `F5`, `edit.deleteRows` → `Delete`, `view.nextTab` → `Ctrl+Tab`, `view.toggleFullscreen` → `F11`, `file.newView` → `Ctrl+Alt+V`.
  - `windows and macOS are unchanged`: `acceleratorFor(commandById('conn.refreshSchema'), 'windows')` is `CmdOrCtrl+F5`, `'macos'` is `CmdOrCtrl+Shift+R`; `acceleratorFor(commandById('app.quit'), 'windows')` and `'macos'` are `undefined`.
  - `linux reserved list`: contains normalized `CmdOrCtrl+F5`, `CmdOrCtrl+Alt+ArrowLeft`, `CmdOrCtrl+Alt+T`, `CmdOrCtrl+Shift+Z`, `Alt+F4`; does not contain `CmdOrCtrl+Q`. The existing uniqueness and reserved loops already cover `'linux'`; confirm they fail before the override (Ctrl+F5 clash).
  - `menuModel.test.ts`: the Linux-adapted File submenu ends with `{ kind: 'item', commandId: 'app.quit' }` and has no `predefined: 'quit'`; the Windows File submenu still ends with `predefined: 'quit'`.
  - `menuHost.test.ts`: on `linux`, `app.quit` is built with text `Quit\tCtrl+Q` and no `accelerator`.
  - `shortcutsCheatSheet.test.ts`: Linux File group has `{ label: 'Quit', shortcut: 'Ctrl+Q' }`; Linux View/Connection group has Refresh Schema `Ctrl+Shift+R`.
  - `editorKeymap.test.ts`: `menuKeyCollisions(BASIC_SETUP_KEYMAP, 'linux')` equals `[]`.
  - Add `app.quit` to the expected id list.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/commands src/lib/editorKeymap.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `acceleratorFor` precedence from Global Constraints. `adaptMenuModel` on `linux` pushes `item('app.quit')` instead of `predefined('quit')`. `App.tsx` handler `app.quit`: `getCurrentWindow().close()` (closing the last window exits on Linux).
- [ ] **Step 4: Run** `bun run test`. Expected: PASS (`handlerWiring.test.ts` included).
- [ ] **Step 5: Commit** `feat(desktop): Linux shortcut overrides, reserved keys and Ctrl+Q`.

---

### Task 3: Linux window chrome

**Files:**
- Create: `apps/desktop/src/components/LinuxCaptionButtons.tsx`, `apps/desktop/src/components/ResizeHandles.tsx`, `apps/desktop/src-tauri/tauri.linux.conf.json`
- Modify: `apps/desktop/src/lib/windowChrome.ts`, `apps/desktop/src/components/Navbar.tsx`, `apps/desktop/src/App.tsx` (mount `ResizeHandles`), `apps/desktop/src-tauri/capabilities/default.json` (`core:window:allow-start-resize-dragging`)
- Test: `apps/desktop/src/lib/windowChrome.test.ts`

**Interfaces:**
- Produces: `captionButtons(maximized: boolean, platform?: Platform)` (Linux restore label `Restore`, Windows keeps `Restore Down`); `navbarPadding('linux')` → `'pl-4 pr-2'`; `navbarEndGroupClass('linux')` → same as Windows; `type ResizeDirection` (re-exported from `@tauri-apps/api/window`); `resizeEdges(state: { maximized: boolean; fullscreen: boolean }): { direction: ResizeDirection; cursor: string; className: string }[]`.

- [ ] **Step 1: Write failing tests** in `windowChrome.test.ts`: `linux restore label` (`captionButtons(true, 'linux')[1]` is `{ action: 'restore', label: 'Restore' }`; `captionButtons(true, 'windows')[1].label` stays `Restore Down`); `linux navbar padding` (`'pl-4 pr-2'`, macOS still `'pl-24 pr-4'`); `eight resize edges` (`resizeEdges({maximized:false, fullscreen:false})` directions are exactly `North, South, East, West, NorthEast, NorthWest, SouthEast, SouthWest`, cursors `ns-resize`, `ns-resize`, `ew-resize`, `ew-resize`, `nesw-resize`, `nwse-resize`, `nwse-resize`, `nesw-resize`); `no handles while maximized or full screen` (both states → `[]`).
- [ ] **Step 2: Run** `bun --cwd apps/desktop test src/lib/windowChrome.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `className` gives fixed positioning: edges 4 px thick inset by 8 px from corners, corners 8×8 px, `z-50`. `ResizeHandles` (rendered only when `currentPlatform() === 'linux'`) tracks maximized/full screen via `onResized` + `isMaximized()`/`isFullscreen()` and calls `startResizeDragging(direction)` on `mousedown` with button 0. `LinuxCaptionButtons` renders `captionButtons(maximized, 'linux')` with `data-no-drag`, sizes from Global Constraints, reusing the Windows glyph SVGs (move them to a shared module if they are inlined in `WindowsCaptionButtons.tsx`). `Navbar` renders `LinuxCaptionButtons` on Linux in the same end group Windows uses. `tauri.linux.conf.json`: `app.windows` repeats the full `main` entry from `tauri.conf.json` without `titleBarStyle`/`hiddenTitle` and with `"decorations": false` (merge patch replaces arrays). Bundle keys are added in Task 4.
- [ ] **Step 4: Run** `bun run test` and `bun --cwd apps/desktop test src/lib/ipcPermissions.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): frameless Linux window with caption buttons and resize handles`.

---

### Task 4: Linux runtime and bundle identity

**Files:**
- Create: `apps/desktop/src-tauri/linux/bizzi-db.desktop`
- Modify: `apps/desktop/src-tauri/src/platform.rs`, `src/lib.rs`, `apps/desktop/src-tauri/Cargo.toml`, `tauri.linux.conf.json`

**Interfaces:**
- Produces: `pub fn webkit_env_default(nvidia: bool, current: Option<&std::ffi::OsStr>) -> Option<(&'static str, &'static str)>` (`Some(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"))` only when `nvidia && current.is_none()`); `#[cfg(target_os = "linux")] pub fn prepare_linux()` (applies `webkit_env_default` with `Path::new("/proc/driver/nvidia/version").exists()`, then `glib::set_prgname(Some("com.bizzidb.app"))`), called first in `run()`.

- [ ] **Step 1: Write failing Rust tests** in `platform.rs`: `nvidia without a user value gets the workaround`; `user value is never overridden` (`webkit_env_default(true, Some(OsStr::new("0")))` → `None`); `no nvidia, no change` → `None`; `desktop entry matches the identifier` (`include_str!("../linux/bizzi-db.desktop")` contains `StartupWMClass=` + the `identifier` parsed with `serde_json` from `include_str!("../tauri.conf.json")`, plus `Terminal=false` and `Type=Application`).
- [ ] **Step 2: Run** `cargo test -p db-desktop --locked platform`. Expected: FAIL.
- [ ] **Step 3: Implement.** `Cargo.toml`: `[target.'cfg(target_os = "linux")'.dependencies] glib = "=0.18.5"`. Desktop template lines: `[Desktop Entry]`, `Categories={{categories}}`, `Comment={{comment}}`, `Exec={{exec}}`, `Icon={{icon}}`, `Name={{name}}`, `StartupWMClass=com.bizzidb.app`, `Terminal=false`, `Type=Application`, `Keywords=database;postgres;postgresql;sql;`. `tauri.linux.conf.json` `bundle`: `targets: ["deb", "appimage"]`, `category: "DeveloperTool"`, `shortDescription: "Desktop client for PostgreSQL"`, `linux.deb.desktopTemplate: "linux/bizzi-db.desktop"`. Comment the prgname call with why (X11 `WM_CLASS` must equal the Wayland app id and `StartupWMClass`) and the env call with the NVIDIA DMA-BUF reason.
- [ ] **Step 4: Run** `cargo test -p db-desktop --locked`, then on a Linux machine or the CI job from Task 7 `bun --cwd apps/desktop tauri build --bundles deb,appimage`. Expected: PASS; `dpkg-deb -I` shows `Depends:` with `libwebkit2gtk-4.1-0` and `libgtk-3-0`; the extracted `.desktop` has `StartupWMClass=com.bizzidb.app`. `git diff Cargo.lock` adds only the `glib` edge.
- [ ] **Step 5: Commit** `feat(desktop): Linux desktop identity, NVIDIA WebKit default and bundle config`.

---

### Task 5: Secret Service availability

**Files:**
- Modify: `crates/storage/src/secrets.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/permissions/app.toml`, `apps/desktop/src/lib/platformCopy.ts`, `apps/desktop/src/components/Modals/SettingsModal.tsx`, `apps/desktop/src/App.tsx`, `packages/core/src/settings/index.ts` (or the module holding `settings_get`'s wrapper)
- Test: `secrets.rs` tests, `lib.rs` tests, `apps/desktop/src/lib/platformCopy.test.ts`

**Interfaces:**
- Produces: `impl KeychainSecrets { pub fn probe(&self) -> Result<(), StorageError> }` (`get_password("__bizzi_probe__")`; `Ok(None)` = available); `pub fn keychain_error_message(e: &keyring::Error) -> String` used by every `KeychainSecrets` method's `map_err`; `fn ensure_keychain_toggle(previous: bool, next: bool, probe: impl FnOnce() -> Result<(), StorageError>) -> Result<(), String>` in `lib.rs`, called at the top of `settings_save`; Tauri command `keychain_available(state) -> bool`; TS `keychainAvailable(): Promise<boolean>`; `secretStoreName('linux')` → `'system keyring'`, `secretStoreLongName('linux')` → spec long name.

- [ ] **Step 1: Write failing tests.**
  - `secrets.rs` `keyring errors read as one message`: `keychain_error_message(&keyring::Error::NoStorageAccess(Box::new(std::io::Error::other("org.freedesktop.DBus.Error.ServiceUnknown"))))` equals `"The system keychain is not available. Unlock or start your keyring (GNOME Keyring or KWallet), or turn off the system keychain in Settings."` and does not contain `DBus`; `PlatformFailure` maps to the same; `NoEntry` is never passed here (assert the doc via a test that `get_password` still returns `Ok(None)` on `InMemorySecrets`).
  - `lib.rs` `enabling keychain is refused when unavailable even with no connections`: `ensure_keychain_toggle(false, true, || Err(StorageError::msg("x")))` is `Err` containing `not available`; `(false, true, || Ok(()))` → `Ok`; `(true, false, failing probe)` → `Ok` (turning off never needs the keyring); `(true, true, failing probe)` → `Ok`.
  - `platformCopy.test.ts`: Linux names from Interfaces; macOS and Windows unchanged.
- [ ] **Step 2: Run** `cargo test -p db-storage --locked secrets`, `cargo test -p db-desktop --locked keychain`, `bun --cwd apps/desktop test src/lib/platformCopy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Register `keychain_available` in `generate_handler!` and `app.toml`. Settings: on open, call `keychainAvailable()`. When it is `false` and the toggle is off, disable the toggle and show, in the existing helper-text style, `No ${secretStoreLongName(platform)} was found. Passwords are stored in a local file only you can read.` A toggle that is already on stays enabled, so the user can turn it off. Never log the probe key or values.
- [ ] **Step 4: Run** the Step 2 commands and `bun run test`. Expected: PASS (`ipcPermissions.test.ts` included).
- [ ] **Step 5: Commit** `feat: detect the Secret Service keyring and refuse enabling it when absent`.

---

### Task 6: Updates per install kind

**Files:**
- Create: `apps/desktop/src-tauri/src/update_channel.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `permissions/app.toml`, `apps/desktop/src/lib/appUpdate.ts`, `apps/desktop/src/App.tsx`, `packages/core/src/app/index.ts` (create if no app module exists; export from `packages/core/src/index.ts`)
- Test: `update_channel.rs` tests, `apps/desktop/src/lib/appUpdate.test.ts`

**Interfaces:**
- Produces: `pub enum InstallKind { Native, AppImage, Deb, Other }`; `pub fn install_kind(os: &str, appimage_env: bool, exe: &Path, dpkg_list_exists: bool) -> InstallKind` (non-Linux → `Native`; `appimage_env` → `AppImage`; `exe` under `/usr/` and `dpkg_list_exists` → `Deb`; else `Other`); `#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct UpdateChannel { pub self_update: bool, pub target: Option<String> }`; `pub fn update_channel(kind: InstallKind, arch: &str) -> UpdateChannel` (`Native`/`AppImage` → `{true, None}`, `Deb` → `{true, Some(format!("linux-{arch}-deb"))}`, `Other` → `{false, None}`); command `app_update_channel() -> UpdateChannel` reading `APPIMAGE`, `current_exe()`, `/var/lib/dpkg/info/bizzi-db.list`. TS: `type UpdateChannel = { selfUpdate: boolean; target: string | null }`; `appUpdateChannel(): Promise<UpdateChannel>`; in `appUpdate.ts` `checkOptions(channel: UpdateChannel): { target: string } | undefined`, `SELF_UPDATE_UNSUPPORTED_MESSAGE` (exact copy from Global Constraints), `canAutoCheck(channel: UpdateChannel): boolean`.

- [ ] **Step 1: Write failing tests.** Rust: `deb install updates through the deb key` (`update_channel(install_kind("linux", false, Path::new("/usr/bin/bizzi-db"), true), "x86_64")` → `{ self_update: true, target: Some("linux-x86_64-deb") }`); `appimage uses the default key` (`appimage_env: true`, exe `/tmp/.mount_x/usr/bin/bizzi-db` → `{true, None}`); `other install never self-updates` (`/home/u/src/target/release/db-desktop`, no dpkg list → `{false, None}`; `/usr/bin/bizzi-db` without the dpkg list → `Other`); `macos and windows are native` (`{true, None}`). TS: `checkOptions({selfUpdate:true,target:'linux-x86_64-deb'})` → `{ target: 'linux-x86_64-deb' }`, `target: null` → `undefined`; `canAutoCheck({selfUpdate:false,target:null})` → `false`; `manual check without self-update explains why` (the feedback for a non-updatable channel is `SELF_UPDATE_UNSUPPORTED_MESSAGE`).
- [ ] **Step 2: Run** `cargo test -p db-desktop --locked update_channel` and `bun --cwd apps/desktop test src/lib/appUpdate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The deb package name `bizzi-db` must match what Task 4's bundle produces; read it from the built `.deb` (`dpkg-deb -f <deb> Package`) and fix the constant if it differs. `App.tsx`: fetch the channel once at startup; background checks run only when `canAutoCheck`; `check(checkOptions(channel))`; `app.checkUpdates` with `selfUpdate: false` shows `SELF_UPDATE_UNSUPPORTED_MESSAGE` via the same toast path as other manual-check feedback. A failed `appUpdateChannel()` call falls back to `{ selfUpdate: true, target: null }`, so macOS and Windows behave exactly as today.
- [ ] **Step 4: Run** the Step 2 commands, `bun run test`, `cargo test -p db-desktop --locked`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): pick the updater channel from how Linux installed the app`.

---

### Task 7: Linux CI

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Add job `unit-linux`** (`runs-on: ubuntu-22.04`, `timeout-minutes: 45`, same SHA-pinned actions as `unit-windows`): checkout; setup-bun `1.3.11`; rust stable with `clippy`; `Swatinem/rust-cache`; apt install `libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev`; `bun install --frozen-lockfile`; `bun run --cwd apps/desktop build`; `cargo test -p db-desktop --locked`; `cargo clippy -p db-desktop --all-targets --locked -- -D warnings`.
- [ ] **Step 2: Validate YAML** with `bun -e "Bun.YAML.parse(await Bun.file('.github/workflows/test.yml').text())"`. Expected: exit 0.
- [ ] **Step 3: Push the branch, open a draft PR, bind it with the `ccd_pr` tools.** Expected: `unit-linux` passes, including `ssh_backend_supports_ed25519_host_keys` and the Task 1/4/6 Rust tests. A failure caused by Linux paths or libraries is fixed at its source with a regression test, not skipped.
- [ ] **Step 4: Commit** `ci: run desktop tests and clippy on Linux`.

---

### Task 8: Linux release job

**Files:**
- Create: `apps/desktop/scripts/linuxBundle.ts`, `linuxBundle.test.ts`, `verify-linux-bundle.ts`
- Modify: `apps/desktop/scripts/updaterManifest.ts`, `updaterManifest.test.ts`, `.github/workflows/release.yml`, `RELEASING.md`, `SECURITY.md`, `.cursor/rules/cut-release.mdc`

**Interfaces:**
- Produces: `LINUX_PLATFORMS = ['linux-x86_64', 'linux-x86_64-deb'] as const`; `validateDebControl(control: string): string[]` (problems unless `Package: bizzi-db`, `Architecture: amd64`, and `Depends` lists `libwebkit2gtk-4.1-0` and `libgtk-3-0`); `validateDesktopEntry(text: string, identifier: string): string[]` (requires `Type=Application`, `Exec=`, `Icon=`, `StartupWMClass=<identifier>`); CLI `bun verify-linux-bundle.ts <deb> <appimage> <tauri.conf.json>` runs `dpkg-deb -f`, `dpkg-deb --fsys-tarfile | tar -xO --wildcards '*.desktop'`, `<appimage> --appimage-extract` into a temp dir, checks the AppImage's `.desktop` too, prints one `::error::` per problem, exits 1 on any.

- [ ] **Step 1: Write failing tests.** `linuxBundle.test.ts`: a control text from a real Tauri `.deb` (fixture string in the test) → `[]`; missing `libwebkit2gtk-4.1-0` → `['Depends is missing libwebkit2gtk-4.1-0']`; `Architecture: arm64` → one problem; a desktop entry with `StartupWMClass=bizzi-db` → `['StartupWMClass must be com.bizzidb.app']`. `updaterManifest.test.ts`: a manifest with darwin + windows only fails with `[...DARWIN_PLATFORMS, ...LINUX_PLATFORMS]` with `platform linux-x86_64-deb is missing`.
- [ ] **Step 2: Run** `bun --cwd apps/desktop test scripts`. Expected: FAIL.
- [ ] **Step 3: Implement** the scripts.
- [ ] **Step 4: Run** `bun --cwd apps/desktop test scripts`. Expected: PASS.
- [ ] **Step 5: Add `publish-linux`** to `release.yml`, with `publish` and `publish-windows` byte-identical. `needs: [publish, publish-windows]`; `if: always() && needs.publish.result == 'success' && vars.LINUX_RELEASE_ENABLED == 'true'`; `runs-on: ubuntu-22.04`; `timeout-minutes: 60`. Steps: checkout; setup-bun; release-notes step copied from `publish-windows`; rust stable; apt install the Task 7 packages plus `xvfb`; `bun install --frozen-lockfile`; tauri-action (same inputs as `publish-windows`, `TAURI_SIGNING_*` env, no `args`); `verify-updater-manifest.ts <tag> <repo> <list>`, where `<list>` is `darwin-aarch64,darwin-x86_64,linux-x86_64,linux-x86_64-deb` plus `,windows-x86_64` when `needs.publish-windows.result == 'success'`; `gh release download` the `*.deb` and `*.AppImage` into `$RUNNER_TEMP/published`; `verify-linux-bundle.ts`; smoke: `sudo apt-get install -y ./published/*.deb`, then `xvfb-run -a timeout 20 <cmd>` where `<cmd>` is the `Exec=` value of the installed `.desktop` file, and for the AppImage `APPIMAGE_EXTRACT_AND_RUN=1 xvfb-run -a timeout 20 ./*.AppImage`; each must exit `124` (still running when killed), anything else fails; checksums: `sha256sum *.deb *.AppImage > SHA256SUMS`; when `secrets.LINUX_GPG_PRIVATE_KEY` is set, import it and `gpg --batch --pinentry-mode loopback --passphrase "$LINUX_GPG_PASSPHRASE" --armor --detach-sign SHA256SUMS`, then `gpg --verify SHA256SUMS.asc SHA256SUMS`; otherwise emit `::warning title=Linux checksums not signed::`; `gh release upload` `SHA256SUMS` (and `.asc`) `--clobber`. Last step `if: failure()`: delete the `*.deb`, `*.deb.sig`, `*.AppImage`, `*.AppImage.sig` and `SHA256SUMS*` assets, strip the Linux keys with `jq '.platforms |= with_entries(select(.key | startswith("linux-") | not))'`, and re-upload `latest.json`, the same way as the Windows cleanup.
- [ ] **Step 6: Validate YAML** as in Task 7. Expected: exit 0.
- [ ] **Step 7: Docs.** `RELEASING.md`: three jobs and their order, `LINUX_RELEASE_ENABLED`, re-run failed jobs instead of retagging, and the spec's one-time maintainer setup. `SECURITY.md`: the two GPG secrets, the fingerprint placeholder the maintainer fills in, how users verify (`gpg --verify SHA256SUMS.asc SHA256SUMS && sha256sum -c --ignore-missing SHA256SUMS`), and that the Linux updater uses the same minisign key. `cut-release.mdc`: the same job-order note.
- [ ] **Step 8: Commit** `ci: build, smoke-test and publish Linux packages`.

---

### Task 9: Cross-distro smoke and manual verification

**Files:**
- Modify: `.github/workflows/release.yml` (job `smoke-linux-distros`)
- Create: `docs/linux-verification.md` (checklist with a result column; filled in, committed)

- [ ] **Step 1: Add `smoke-linux-distros`**: `needs: publish-linux`, `runs-on: ubuntu-latest`, `continue-on-error: true`, matrix `container: [debian:12, ubuntu:24.04, fedora:41, archlinux:latest]`. Each installs `xvfb` (`xorg-x11-server-Xvfb` on Fedora, `xorg-server-xvfb` on Arch) and `curl`, downloads the release AppImage (and, on the two Debian-family images, the `.deb` through `apt-get install -y ./…deb`), and runs the same `timeout 20` / exit `124` check. Validate YAML. Commit `ci: smoke-launch Linux packages on four distros`.
- [ ] **Step 2: Prerelease.** With the maintainer's go-ahead, tag `v<next>-rc.1` (prerelease per `RELEASING.md`). Expected: all three publish jobs green; `latest.json` has `linux-x86_64` and `linux-x86_64-deb`; the smoke matrix is green or each red row is understood.
- [ ] **Step 3: Manual matrix**, one row per environment: Ubuntu 22.04 GNOME X11 (`.deb`), Ubuntu 24.04 GNOME Wayland (`.deb` and AppImage with `libfuse2t64`), Fedora 41 GNOME Wayland (AppImage), KDE Plasma 6 Wayland (AppImage), Debian 12 XFCE X11 (`.deb`), one NVIDIA proprietary-driver machine. For each: one header, caption buttons, resize from all edges, double-click maximize, edge tiling, Super+arrows; dock shows the Bizzi DB icon with one entry; every row of the Linux shortcut map with focus in the grid, the SQL editor and a text input; `Ctrl+F5`, `Ctrl+Alt+→` reach the desktop, not the app; `Ctrl+Alt+V` opens New View on KDE; Alt tap opens the menu popup; second launch focuses the window; keyring toggle on with GNOME Keyring (item visible in Seahorse) and disabled with explanation on a session without one; Postgres TLS `verify-full` to a public CA host; SSH tunnel with an Ed25519 key chosen in the file dialog; copy a cell and paste in another app; update from rc.1 to rc.2 for both `.deb` (pkexec prompt) and AppImage; side-by-side screenshot with macOS.
- [ ] **Step 4: macOS and Windows regression pass** on the same prerelease (Windows checklist steps 2–4 of `docs/windows-verification.md`, macOS: traffic lights, ⌘ shortcuts, DMG, update).
- [ ] **Step 5: Commit** the filled checklist `docs: Linux verification results`. Any failure becomes a fix with a reproducing test before Task 10.

---

### Task 10: Announce Linux availability

Only after a non-prerelease release has both Linux packages, `SHA256SUMS`, and the two `linux-*` manifest keys, and `LINUX_RELEASE_ENABLED` is `true`.

**Files:**
- Modify: `README.md`, `apps/web/src/lib/site.ts`, `apps/web/src/lib/site.test.ts`, `apps/web/src/components/DownloadButtons.tsx`, `CHANGELOG.md`

**Interfaces:**
- Produces: `DownloadPlatformId = 'macos' | 'windows' | 'linux'`; `detectPreferredPlatform` returns `'linux'` for a UA containing `Linux` and not `Android`.

- [ ] **Step 1: Write failing tests** in `site.test.ts`: `DOWNLOAD_PLATFORMS` ids `['macos', 'windows', 'linux']`; Linux `label: 'Linux'`, `detail: '.deb and AppImage, x64'`, `href: RELEASES_URL`; `detectPreferredPlatform('Mozilla/5.0 (X11; Linux x86_64)')` → `'linux'`; an Android UA → `'macos'` (unchanged default); banned-word test unchanged.
- [ ] **Step 2: Run** `bun --cwd apps/web test`. Expected: FAIL.
- [ ] **Step 3: Implement**; icon lucide `Terminal`. README: badge `Platform-macOS%20%7C%20Windows%20%7C%20Linux`; Linux install row: `.deb` for Ubuntu/Debian (`sudo apt install ./Bizzi.DB_<version>_amd64.deb`), AppImage for other distros (`chmod +x`, needs `libfuse2`/`libfuse2t64`), checksum verification link to `SECURITY.md`; Linux build prerequisites from the spec in the development section. `CHANGELOG.md` entry for the release.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: announce Linux support`.
