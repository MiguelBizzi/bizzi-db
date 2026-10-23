# Linux support: audit and design

Date: 2026-10-22 · Status: draft for review · Audited tree: `origin/main` at `a19f5fb` (v0.1.20, Windows shipped)

## Goal

Ship Bizzi DB on Linux x86_64 with the same look and flows as macOS and Windows, Linux keyboard and window conventions, `.deb` and AppImage packages that GitHub Actions builds, verifies and publishes on every `v*` tag, and in-app updates for both. macOS and Windows must not change.

## Audit

### Already cross-platform (checked, no work)

| Area | State on Linux |
|---|---|
| Rust crates | `db-core`, `db-postgres`, `db-storage` have no OS-specific code beyond `#[cfg(unix)]` permission helpers, which apply on Linux. |
| TLS | `ssh2`'s `vendored-openssl` unifies `openssl-sys` into a static OpenSSL for `native-tls` too, so there is no `libssl` runtime dependency. `native-tls` and the updater find system CAs through `openssl-probe`. |
| File permissions | `Storage::open` and `FileSecrets` set the app-data dir `0700` and files `0600` under `#[cfg(unix)]`. |
| App data | `app_data_dir()` = `$XDG_DATA_HOME/com.bizzidb.app` (default `~/.local/share/com.bizzidb.app`); WebKit cache under `~/.cache/com.bizzidb.app`. All paths are `PathBuf`. |
| Shell execution | The app spawns no processes. The only external programs are inside plugins: `xdg-open` (opener) and `pkexec dpkg -i` (updater, `.deb` only). Nothing depends on the user's shell. |
| Keyboard dispatch | Off macOS, `useAppMenu` already installs the webview `keydown` dispatcher (`keyboard.ts`) and the Alt-tap menu popup; the native menu is never attached. AltGr guard, browser-key suppression and mouse back/forward suppression apply to Linux unchanged. |
| Menu model | `platformAdapter.ts` dissolves the app menu off macOS and swaps Full Screen for `view.toggleFullscreen` (F11). |
| Single instance | `tauri-plugin-single-instance =2.2.4` is already enabled for `target_os = "linux"` (D-Bus). |
| SSH | Vendored OpenSSL backend, so Ed25519 works (the Windows gap does not exist here). |
| Clipboard | `navigator.clipboard` in the webview; WebKitGTK supports it on Tauri's secure custom scheme. X11 primary selection works natively. |
| Notifications, tray | None on any platform. Nothing to do. |
| Fonts, scrollbars | Google Fonts and app-drawn overlay scrollbars, same as WebView2. |
| Icons | `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png` exist. |
| CI compile | `test.yml` `build (ubuntu-latest)` already runs `cargo check -p db-desktop` with the WebKitGTK 4.1 dev packages. |

### Gaps

| # | Gap | Impact on Linux |
|---|---|---|
| L1 | `currentPlatform()` sniffs the user agent. WebKitGTK may present a Safari/macOS user agent, and nothing has ever checked what it reports inside Tauri. | Linux could be detected as macOS: ⌘ labels, no keyboard dispatch, traffic-light padding. |
| L2 | Shortcuts reuse the Windows overrides. `Ctrl+F5` (Refresh Schema) switches to workspace 5 on XFCE; `Ctrl+Alt+←/→/↑/↓`, `Ctrl+Alt+T/L/D/Del/Esc` and `Ctrl+F1`–`F12` belong to GNOME, KDE or XFCE. Linux apps quit with `Ctrl+Q`, not Alt+F4, and the menu says "Quit", not "Exit". | Shortcuts eaten by the desktop; non-native quit. |
| L3 | `titleBarStyle: "Overlay"` is macOS-only, so Linux draws a GTK title bar above the navbar; the navbar keeps the macOS `pl-24` traffic-light gap; no caption buttons are rendered off Windows. | Double header, empty left gap; UI differs. |
| L4 | An undecorated GTK window has no resize border the webview does not cover. | Window can't be resized from its edges. |
| L5 | No `.desktop` `StartupWMClass`; GTK's program name is the binary name, while Tauri sets the Wayland app id to `com.bizzidb.app`. | Dock/taskbar shows a generic icon or a second entry. |
| L6 | WebKitGTK's DMA-BUF renderer shows a blank or flickering window with the NVIDIA proprietary driver. | Blank window for NVIDIA users. |
| L7 | `keyring =2.3.3` uses the Secret Service D-Bus API (pure-Rust `zbus`, no `libsecret` needed). Without a Secret Service provider (i3/sway without gnome-keyring, KDE with KWallet's Secret Service off, headless sessions), keychain calls fail with raw D-Bus errors, and turning the keychain setting on with no saved connections succeeds anyway because `migrate` makes no keychain call. | Setting looks on but every later save fails; raw errors. |
| L8 | `secretStoreName` says "system keychain" on Linux. | Wrong term ("keyring" on Linux). |
| L9 | `tauri-plugin-updater =2.2.0` reads one key, `linux-x86_64`, which tauri-action points at the AppImage. From a `.deb` install it downloads the AppImage, fails `is_deb`, and errors. From any other location it would try to overwrite the running binary. The plugin's `check({ target })` option selects another manifest key. | `.deb` users can't update; source builds misbehave. |
| L10 | No Linux bundle config, no release job, `verify-updater-manifest` knows no Linux keys, no Linux packaging checks, no checksums/signatures. | Nothing to download. |
| L11 | `db-desktop` tests and clippy never run on Linux. | Linux regressions unseen. |
| L12 | README says "Linux: Not available yet"; landing page offers macOS and Windows only. | Docs. |

## Decisions

1. **Platform comes from Rust** (L1). A tiny in-crate plugin injects `window.__BIZZI_PLATFORM__ = "<macos|windows|linux>"` as a webview init script, so it is set before any page script. `currentPlatform()` reads it first and falls back to the user agent (bun tests, browser preview).
2. **Linux shortcuts = Windows map with three Linux overrides** (L2): Refresh Schema `Ctrl+Shift+R` (the macOS chord, as `Ctrl+F5` is an XFCE workspace key), Quit `Ctrl+Q` through a new registry command `app.quit` that replaces the predefined quit item in the Linux menu, and Redo `Ctrl+Shift+Z` reserved next to `Ctrl+Y`. A `linuxAccelerator` field overrides `nonMacAccelerator`, which overrides `accelerator`. A Linux reserved list (below) makes the registry tests reject any desktop-owned chord.
3. **Frameless window on Linux** (L3), the same as Windows: `decorations: false` in `tauri.linux.conf.json`. The navbar draws Linux caption buttons on the right (minimize, maximize/restore, close): 24 px circular, 8 px apart, 8 px from the edge, `bg-foreground/10` on hover, the same 10 px glyphs as Windows, no red close. The navbar keeps its height and colours; the left gap becomes `pl-4`. Double-click on the drag region toggles maximize. Reading the user's GNOME `button-layout` is out of scope.
4. **Webview resize handles on Linux** (L4): eight invisible handles (4 px edges, 8 px corners) call `startResizeDragging(direction)`. They are not rendered while maximized or full screen.
5. **Desktop identity** (L5): on Linux, set the GLib program name to `com.bizzidb.app` before Tauri starts, and ship a desktop template with `StartupWMClass=com.bizzidb.app`, so X11 `WM_CLASS`, the Wayland app id and the `.desktop` entry agree.
6. **NVIDIA workaround** (L6): when `/proc/driver/nvidia/version` exists and `WEBKIT_DISABLE_DMABUF_RENDERER` is unset, set it to `1` before Tauri starts. A value the user set is never changed.
7. **Secret storage on Linux** (L7, L8): keep the existing design. The keychain stays opt-in, and the default store remains `secrets.json` (`0600` in a `0700` dir). New: `KeychainSecrets::probe()` (a `get` on a fixed probe key; `NoEntry` = available). `settings_save` refuses to turn the keychain on when the probe fails, even with no connections. A `keychain_available` command lets Settings disable the toggle and explain why. Keyring errors become one readable message. Linux copy says "system keyring", and the long form is "Secret Service keyring (GNOME Keyring or KWallet)".
8. **Packages, phase 1: `.deb` + AppImage, x86_64.** `.deb` is the native path for Ubuntu/Debian (most Linux developers; installs to the menu, `apt` handles dependencies). AppImage covers Fedora, Arch and the rest without root. Built on `ubuntu-22.04` (glibc 2.35, WebKitGTK 4.1), so both run on Ubuntu 22.04+, Debian 12+, Fedora 38+ and current Arch.
9. **Updates per install kind** (L9). A Rust command `app_update_channel` returns `{ selfUpdate, target }`. AppImage (`$APPIMAGE` set): self-update through the default `linux-x86_64` key. `.deb` (binary under `/usr` and `/var/lib/dpkg/info/bizzi-db.list` present): self-update with `target: "linux-x86_64-deb"`, which the plugin installs through `pkexec dpkg -i` (graphical password prompt). Anything else: no background checks, and a manual check explains that this copy can't update itself. macOS and Windows: unchanged (`selfUpdate: true`, no target).
10. **Signing.** Update integrity is the existing minisign key (the plugin rejects unsigned updates on every format). For downloads: a `SHA256SUMS` file covering the Linux assets, plus a detached `SHA256SUMS.asc` signed with a project GPG key whose fingerprint is published in `SECURITY.md`. Without the GPG secrets the release still ships the checksums, with a warning, which is the same model as unsigned Windows. `.deb` files are not signed individually; `dpkg` never verifies them, and apt verifies repository metadata, which arrives with the phase 2 apt repo.
11. **Release order:** `publish` (macOS) → `publish-windows` → `publish-linux`, chained so no two jobs write `latest.json` at once. `publish-linux` runs while `LINUX_RELEASE_ENABLED` is `true` and macOS succeeded. It runs whatever the Windows result was, including skipped. Before it finishes it smoke-launches both packages under Xvfb. Any failure withdraws the Linux assets and the `linux-*` manifest keys. A non-gating matrix job then launches the published packages in Debian, Fedora and Arch containers.

## Linux shortcut map

Identical to the Windows map in `2026-10-22-windows-support-design.md` except:

| Command | macOS | Windows | Linux |
|---|---|---|---|
| Refresh Schema | ⇧⌘R | Ctrl+F5 | **Ctrl+Shift+R** |
| Quit | ⌘Q | Alt+F4 (system) | **Ctrl+Q** (`app.quit`) |
| Redo | ⇧⌘Z | Ctrl+Y | **Ctrl+Shift+Z** or Ctrl+Y (editor) |

Reserved on Linux (no command may claim them): Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Alt+F4, Alt+Space, Alt+Tab, F10, F12, Ctrl+Escape, Ctrl+Alt+T, Ctrl+Alt+L, Ctrl+Alt+D, Ctrl+Alt+Delete, Ctrl+Alt+Escape, Ctrl+Alt+ArrowLeft, Ctrl+Alt+ArrowRight, Ctrl+Alt+ArrowUp, Ctrl+Alt+ArrowDown, Ctrl+F1 through Ctrl+F12.

## Packaging formats evaluated

| Format | Reach | Updates | Cost | Decision |
|---|---|---|---|---|
| `.deb` | Ubuntu, Debian, Mint, Pop!_OS | In-app (`pkexec dpkg -i`); apt once a repo exists | Built by Tauri | **Phase 1** |
| AppImage | Any glibc ≥ 2.35 distro, no root | In-app (replaces the file) | Built by Tauri; needs `libfuse2` on the user's machine (`libfuse2t64` on Ubuntu 24.04) | **Phase 1** |
| `.rpm` | Fedora, RHEL, openSUSE | Plugin 2.2.0 cannot install rpm; needs a DNF repo | Built by Tauri; signing via `rpmsign` | Phase 2, with a signed DNF repo |
| Flatpak (Flathub) | All distros, sandboxed | Flathub | Manifest + Flathub review; updater off in-app; keyring via `--talk-name=org.freedesktop.secrets` | Phase 2 |
| Snap | Ubuntu | Snap Store | Strict confinement and WebKitGTK via the gnome extension; classic needs manual review | Not planned |
| apt repository | Debian family | `apt upgrade` | GPG-signed repo on GitHub Pages | Phase 2 |
| aarch64 | ARM laptops, Raspberry Pi | — | `ubuntu-24.04-arm` runner | Phase 2 |

## System integration on Linux

| Behaviour | Linux |
|---|---|
| Close button / Ctrl+Shift+W / Ctrl+Q | Exits the app. |
| Minimize / maximize / snap | Caption buttons, double-click the navbar, Super+↑/↓ and edge tiling by dragging (the window manager handles `startDragging`). |
| Second launch | Focuses the running window. On Wayland, GNOME may show "Bizzi DB is ready" instead of raising it, because Wayland forbids focus stealing. |
| Data | `~/.local/share/com.bizzidb.app/workspace.sqlite`, `secrets.json` (`0600`). |
| Secrets | Secret Service item, service `com.bizzidb.app`, user `<connection id>` (visible in Seahorse / KWalletManager); local file otherwise. |
| File dialog | `rfd` through the XDG desktop portal, falling back to `zenity`. |
| Install | `.deb`: `sudo apt install ./Bizzi.DB_<v>_amd64.deb` or double-click; menu entry under Development. AppImage: `chmod +x`, run. |

## Build and release setup (maintainer, once)

1. Generate a release GPG key (`gpg --quick-gen-key "Bizzi DB Releases <…>" ed25519 sign 3y`). Add secrets `LINUX_GPG_PRIVATE_KEY` (armored) and `LINUX_GPG_PASSPHRASE`. Publish the public key as `docs/release-signing-key.asc` and its fingerprint in `SECURITY.md`.
2. Run the `linux-bundle` workflow (`workflow_dispatch`, read-only, builds and checks the `.deb` and AppImage without publishing) on the release branch and pass the checklist with its artifacts. Then set repository variable `LINUX_RELEASE_ENABLED=true` just before tagging a normal `vX.Y.Z` release: tags are plain, tauri-action publishes with `prerelease: false`, and the updater reads `releases/latest/download/latest.json`, so there is no prerelease channel. In-app updates are checked when the next plain release ships. If the first Linux run fails, the withdraw step removes the Linux assets; turn the variable off until fixed, never retag.
3. `TAURI_SIGNING_PRIVATE_KEY` / password are reused for the Linux updater signatures.

Local Linux development: `rustup`, Bun, and `libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev build-essential file` (Debian/Ubuntu names). Perl is needed for vendored OpenSSL and is present on every distro.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| WebKitGTK rendering or performance differs (no GPU compositing, `backdrop-filter` cost, font hinting) | Medium | Side-by-side screenshot QA; three components use `backdrop-blur` and get checked on a low-end machine. |
| AppImage bundles WebKitGTK from Ubuntu 22.04; newer Mesa/EGL on Arch/Fedora can give a blank window | Medium | Container smoke job, NVIDIA env default, `.deb` as the primary format for Debian-family users. |
| Wayland differences (focus stealing, no global window position, fractional scaling blur) | Medium | QA on GNOME and KDE Wayland; focus behaviour documented. |
| No Secret Service on minimal WMs or headless | Medium | Probe gating plus the existing local file store. |
| tauri-action's manifest has no `linux-x86_64-deb` key, or Tauri writes no `.deb.sig` | Low–medium | The release gate requires both keys, so the first Linux release fails at once and the withdraw step removes the Linux assets before any user updates. |
| `linuxdeploy` is fetched at build time (not reproducible) | Low | `ubuntu-22.04` runner pinned; the AppImage is smoke-tested before it stays published. |
| `pkexec` missing (very minimal installs) | Low | Plugin falls back to zenity/kdialog + sudo; failure shows the existing update error banner. |
| Desktop-owned shortcuts not in the reserved list (custom user bindings, KDE Klipper) | Low | Reserved-list tests; KDE QA row for `Ctrl+Alt+V`. |

## Out of scope

Phase 2 items in the table above, tray icon, reading GNOME `button-layout`, client-side window shadows and rounded corners on the frameless window, `~` expansion in typed SSH key paths (same on every platform), self-hosted fonts.

## Success criteria → where it is proven

| Criterion | Evidence |
|---|---|
| Audit completed | This document |
| Shortcuts adapted | Registry tests pin the Linux map and reserved list; QA rows on GNOME, KDE, XFCE |
| UI/UX preserved | Same components; only caption buttons and resize handles are added; side-by-side screenshots |
| System dependencies handled | `.deb` `Depends` checked in CI; AppImage bundles its libraries; smoke launch on 4 distros |
| Credential storage solved | Probe, gated setting and error mapping tests; QA with and without a keyring |
| Build pipeline ready | `unit-linux` and `publish-linux` jobs |
| Packaging delivered | `.deb` + AppImage on the release, `SHA256SUMS(.asc)` |
| Auto-updates work | `latest.json` has `linux-x86_64` and `linux-x86_64-deb`; QA updates both formats from the first Linux release to the next one |
| No regression | macOS and Windows jobs untouched; their registry/menu tests unchanged; manual macOS and Windows pass |
