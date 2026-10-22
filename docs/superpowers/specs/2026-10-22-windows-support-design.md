# Windows support: audit and design

Date: 2026-10-22 · Status: draft for review

## Goal

Ship Bizzi DB on Windows with the same look and flows as macOS, Windows keyboard and window conventions, and a signed installer that CI builds and publishes on every `v*` tag. macOS must not change.

## Supersedes

The open-source readiness spec (2026-10-19) decided that Windows stays a CI compile check with no installers and no paid signing. This spec replaces those two decisions. The rest of that spec stands, and its `build (windows-latest)` compile check is reused here.

## Audit

### What is already cross-platform

| Area | State |
|---|---|
| Rust crates | `db-core`, `db-postgres`, `db-storage` have no macOS-only code. `tokio-postgres`, `deadpool`, `native-tls` (SChannel on Windows), `rusqlite` (bundled) all build on MSVC. |
| Secrets | `keyring =2.3.3` default features include `platform-windows` (Credential Manager, already in `Cargo.lock` through `windows-sys`). Limit: 1280 UTF-16 units per secret, well above a password or passphrase. |
| File permissions | `restrict_unix_mode` is `#[cfg(unix)]`. On Windows `%APPDATA%\com.bizzidb.app` inherits the user-profile ACL (owner only), which meets the intent of the `0700`/`0600` rule. No code change. |
| App data | `app.path().app_data_dir()` resolves to `%APPDATA%\com.bizzidb.app`. Paths are `PathBuf` throughout. |
| File dialog | `rfd` uses the native Windows dialog. SSH key paths are opaque strings, so `C:\…` paths work. |
| `main.rs` | Already sets `windows_subsystem = "windows"` in release (no console window). |
| `macos.rs` | Compiled only on macOS. Without it Windows gets default behaviour: closing the window exits the app, which is the Windows convention. |
| Menu model | `platformAdapter.ts` already dissolves the app menu on Windows (Settings → Edit, Exit → File, About/Updates → Help). `menuHost.ts` calls `setAsWindowMenu()` off macOS and labels Quit "Exit". |
| Labels | `formatAccelerator` already renders `Ctrl+Shift+N` off macOS. |
| Scrollbars | Native scrollbars are hidden globally (`index.css`); overlay scrollbars are drawn by the app, so they look the same on WebView2. |
| Fonts | Geist Mono and JetBrains Mono load from Google Fonts on both platforms. |
| Icons | `icons/icon.ico` exists. |
| Tray | No tray on macOS, none on Windows. Nothing to do. |

### Gaps

| # | Gap | Impact on Windows |
|---|---|---|
| G1 | Keyboard shortcuts are native-menu accelerators. On macOS the page sees a key first and the menu gets what the page leaves. On Windows the WebView2 child window has keyboard focus, so menu accelerators are not a dependable path. | Shortcuts unreliable. |
| G2 | WebView2 keeps browser keys: F5 / Ctrl+R reload the page (losing all state), Ctrl+P prints, Ctrl+F / F3 / Ctrl+G open a find bar, Alt+←/→ and the mouse back/forward buttons navigate. WKWebView has none of these. | Data loss on F5; UX differs from macOS. |
| G3 | Ctrl+Alt is AltGr on many European layouts (AltGr+Q = `@` on German). A Ctrl+Alt shortcut matched naively would eat typed characters. | Typing breaks on non-US layouts. |
| G4 | `titleBarStyle: "Overlay"` and `hiddenTitle` are macOS-only. Windows draws a native title bar above the app's own navbar, and `WindowControls` renders nothing off macOS. | Double header; UI differs. |
| G5 | `setAsWindowMenu()` attaches a native menu strip, which cannot render in the undecorated window (tao returns 0 from `WM_NCCALCSIZE`) and, hidden, still captures Alt. | UI differs from macOS; Alt is swallowed. |
| G6 | No single-instance guard. Windows starts a second process on every shortcut click; two processes would share `workspace.sqlite`. | Data races; non-native. |
| G7 | `libssh2-sys` uses WinCNG on Windows unless `openssl-on-win32` is enabled. WinCNG has no Ed25519. | Ed25519 SSH keys (the OpenSSH default) fail on Windows only. |
| G8 | macOS-only copy: `QueryResultsView` says "(Cmd + Enter)"; `WorkspaceEmptyState`, `dataExport`, `WindowControls` each sniff the user agent themselves; "System keychain" is a macOS term. | Wrong labels on Windows. |
| G9 | `tauri.conf.json` bundles `["app", "dmg"]` only. No NSIS settings, no updater install mode. | No installer. |
| G10 | `release.yml` is a single macOS job. `verify-updater-manifest` requires only `darwin-*`. No Windows signing. | No Windows release; updater would never see Windows. |
| G11 | `test.yml` runs tests on Ubuntu only. `db-desktop` is never tested. No `.gitattributes`; Windows runners check out with CRLF. | Windows regressions unseen. |
| G12 | README, `SECURITY.md`, `RELEASING.md`, landing page say macOS only. | Docs. |
| G13 | View → Enter Full Screen is a macOS predefined item that does nothing on Windows. | Dead menu item. |

### Not a gap (checked)

- Updater: `tauri-plugin-updater` supports NSIS. The minisign key is shared across platforms.
- `CmdOrCtrl+Alt+I` (macOS devtools) is irrelevant on Windows. Windows devtools are Ctrl+Shift+I / F12, but only in debug builds; release builds have no devtools, so New Index keeps Ctrl+Shift+I.
- Zoom keys: Tauri's `zoomHotkeysEnabled` defaults to false, which turns off WebView2 zoom.

## Decisions

1. **One keyboard path off macOS.** On Windows (and Linux) a webview `keydown` listener (bubble phase) maps the event to an accelerator and runs the matching command through the same gate the menu uses. Native menu items carry no registered accelerator. Their label ends in `\t` + the shortcut, which is how Win32 right-aligns accelerator text. macOS keeps native accelerators unchanged. Because the listener runs in the bubble phase and skips `defaultPrevented` events, CodeMirror bindings still win, which is how macOS behaves today.
2. **A disabled command never swallows its key.** The listener only calls `preventDefault` when the command ran. A Delete key in a text field still deletes text.
3. **Browser keys are suppressed** (G2) whether or not a command claims them: F3, F5, Shift+F5, Ctrl+F5, Ctrl+R, Ctrl+Shift+R, Ctrl+P, Ctrl+F, Ctrl+G, Ctrl+Shift+G, Ctrl+U, Ctrl+J, Ctrl+=, Ctrl+-, Ctrl+0, Alt+←, Alt+→, the BrowserRefresh, BrowserBack and BrowserForward keys, and mouse buttons 3 and 4.
4. **AltGr guard** (G3): with Ctrl and Alt both held, a printable `event.key` that differs from the physical key's base character is typed text and is never a shortcut.
5. **Frameless window on Windows** (G4). `decorations: false` in `tauri.windows.conf.json`. The navbar draws Windows caption buttons (minimize, maximize/restore, close; 46 px wide, full navbar height, flat monochrome glyphs, close hover `#c42b1c` with white glyph) at the right edge, where macOS has traffic lights at the left. Same navbar, same height, same colours. Double-click on the drag region toggles maximize.
6. **No menu bar; tapping Alt opens the menu as a popup** (G5). The menu is never attached to the window (`setAsWindowMenu` is not called): tao 0.32's undecorated window returns 0 from `WM_NCCALCSIZE`, so a Win32 menu bar cannot render, and an attached hidden menu still captures Alt. Instead `Menu.popup` shows it at the navbar's left edge, just below the navbar (logical 16, 52). A tap is Alt down then up with no other key or mouse press between and no blur. Keyboard dispatch does not depend on the menu: shortcuts work before it is built, and an Alt tap does nothing until it exists. Commands remain reachable by shortcut and Ctrl+K.
7. **Single instance on Windows and Linux** (G6) with `tauri-plugin-single-instance`; a second launch focuses the existing window. macOS keeps LaunchServices.
8. **OpenSSL for SSH on Windows** (G7): `ssh2` gets `openssl-on-win32` on Windows targets, vendored like macOS. CI installs NASM.
9. **Installer: NSIS only, per-user** (`installMode: "currentUser"`, no admin prompt), x64 only. Windows on ARM runs it under emulation; a native arm64 build is out of scope. Updater install mode `passive`.
10. **Signing: Azure Trusted Signing** through `bundle.windows.signCommand` and `trusted-signing-cli`. The sign config is generated in CI from repository variables, so local `tauri build` on Windows works unsigned. Signing is optional (decided 2026-10-22: Public Trust certificates are not issued to individual developers outside the US and Canada). With no `AZURE_SIGNING_*` variable set, the installer ships unsigned and updates are still verified by the minisign updater key; with them set, a release without a valid Authenticode signature fails.
11. **Release order:** the macOS job is untouched and runs first. A `publish-windows` job `needs` it, so the two jobs never race on `latest.json`; `tauri-action` merges the Windows entry into the existing manifest. If Windows fails, macOS users are unaffected.
12. **Copy:** every shortcut shown in text comes from the registry (`shortcutLabel`). The secret store is "system keychain" on macOS and "Windows Credential Manager" on Windows.
13. **Full screen on Windows** is a registry command `view.toggleFullscreen` on F11, replacing the macOS predefined item in the Windows menu.

## Shortcut map

`CmdOrCtrl` → Ctrl, `Alt` (Option) → Alt, on every row unless the Windows column says otherwise. **Bold** = Windows-specific override.

| Command | macOS | Windows |
|---|---|---|
| Settings… | ⌘, | Ctrl+, |
| New Query Tab | ⌘T | Ctrl+T |
| New Connection… | ⌘N | Ctrl+N |
| New Table… | ⇧⌘N | Ctrl+Shift+N |
| New View… | ⌥⌘V | Ctrl+Alt+V |
| New Function… | ⌥⌘F | Ctrl+Alt+F |
| New Index… | ⇧⌘I | Ctrl+Shift+I |
| Save Query… | ⌘S | Ctrl+S |
| Export Results… | ⌘E | Ctrl+E |
| Close Tab | ⌘W | Ctrl+W |
| Close Other Tabs | ⌥⌘W | Ctrl+Alt+W |
| Reopen Closed Tab | ⇧⌘T | Ctrl+Shift+T |
| Close Window | ⇧⌘W | Ctrl+Shift+W |
| Quit / Exit | ⌘Q | Alt+F4 (system) |
| Undo / Redo | ⌘Z / ⇧⌘Z | Ctrl+Z / **Ctrl+Y** (system) |
| Find in Table… | ⌘F | Ctrl+F |
| Insert Row | ⌘I | Ctrl+I |
| Delete Selected Rows | ⌘⌫ | **Delete** |
| Format SQL | ⇧⌘F | Ctrl+Shift+F |
| Toggle Comment | ⌘/ | Ctrl+/ |
| Run Statement / Selection | ⌘↵ | Ctrl+Enter |
| Run All | ⇧⌘↵ | Ctrl+Shift+Enter |
| Commit Pending Changes | ⇧⌘S | Ctrl+Shift+S |
| Review Pending Changes | ⇧⌘P | Ctrl+Shift+P |
| Refresh Schema | ⇧⌘R | **Ctrl+F5** |
| Refresh Table | ⌘R | **F5** |
| Command Palette… | ⌘K | Ctrl+K |
| Toggle Sidebar | ⌘B | Ctrl+B |
| Schema Diagram (ERD) | ⇧⌘E | Ctrl+Shift+E |
| Database Metrics | ⇧⌘M | Ctrl+Shift+M |
| Activity Log | ⇧⌘L | Ctrl+Shift+L |
| Next Tab | ⇧⌘] | **Ctrl+Tab** |
| Previous Tab | ⇧⌘[ | **Ctrl+Shift+Tab** |
| Tab 1–8, Last Tab | ⌘1–⌘9 | Ctrl+1–Ctrl+9 |
| Split Pane Right | ⌥⌘\ | Ctrl+Alt+\ |
| Full Screen | ⌃⌘F (system) | **F11** |
| Open menu | — | **Alt** (tap) |
| Run in SQL editor | ⌘↵ | Ctrl+Enter (editor binding) |
| Autocomplete | ⌃Space | Ctrl+Space |

Reserved on Windows (no command may claim them): Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Alt+F4, Alt+Space, F10, F12, Ctrl+Escape.

## System integration on Windows

| Behaviour | Windows |
|---|---|
| Close button / Ctrl+Shift+W | Exits the app (no Dock). |
| Minimize / maximize | Caption buttons, double-click title area, Win+↑/↓, Aero Snap by dragging. |
| Second launch | Focuses the running window. |
| Updates | Same in-app flow; NSIS runs passive and relaunches the app. |
| Data | `%APPDATA%\com.bizzidb.app\workspace.sqlite`; WebView2 data under `%LOCALAPPDATA%\com.bizzidb.app`. |
| Secrets | Windows Credential Manager, target `<connection id>.com.bizzidb.app`; local file fallback as on macOS. |
| Install | `Bizzi DB_<version>_x64-setup.exe`, per user under `%LOCALAPPDATA%\Bizzi DB`, Start menu entry, uninstaller in Apps & features. |

## Build and release setup (maintainer, once)

1. Create an Azure Trusted Signing account and certificate profile (public trust). Identity validation takes days; start first.
2. Create an Entra app registration with the "Trusted Signing Certificate Profile Signer" role on the profile.
3. GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`. Repository variables: `AZURE_SIGNING_ENDPOINT` (e.g. `https://eus.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`.
4. Existing `TAURI_SIGNING_PRIVATE_KEY` / password are reused for the Windows updater signature.

Local Windows development needs Visual Studio Build Tools (C++), Strawberry Perl and NASM (for vendored OpenSSL), Bun, and rustup.

## Out of scope

Windows on ARM native build, MSI, Microsoft Store, winget, Linux installers, self-hosted fonts (offline font fallback differs per OS on macOS too), Windows 11 snap-layout flyout on the custom maximize button.

## Success criteria → where it is proven

| Criterion | Evidence |
|---|---|
| Runs reliably on Windows | Windows CI tests (`bun run test`, `cargo test` incl. `db-desktop`); manual checklist on Windows 11 and 10 |
| UI unchanged | Same components; only the caption buttons swap sides; manual side-by-side screenshots |
| Native shortcuts | Registry tests pin the map above; dispatcher tests |
| Automated builds | `unit-windows` and `publish-windows` jobs |
| Release ready | Authenticode `Valid` check on the published installer; `latest.json` has `windows-x86_64` |
| No regression | macOS job untouched; macOS registry/menu tests unchanged; manual macOS pass |
| Audit completed | This document |
