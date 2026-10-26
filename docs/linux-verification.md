# Linux verification

Manual checklist for the first Linux release. Fill the Result column with pass, fail plus a note, or n/a. Any failure becomes a fix with a reproducing test before `LINUX_RELEASE_ENABLED` is set.

The release workflow only takes plain `vX.Y.Z` tags, publishes every release as the latest one (tauri-action runs with `prerelease: false`), and installed apps update from `releases/latest/download/latest.json`. There is no prerelease to test on, so the procedure is:

1. **Before any tag.** Run the `linux-bundle` workflow (Actions → linux-bundle → Run workflow) on the branch to release. It builds the `.deb` and AppImage, runs the same package checks and Xvfb launch as `publish-linux`, smoke-launches them in the same debian:12, ubuntu:24.04, fedora:41 and archlinux:latest containers as `smoke-linux-distros`, and uploads both as the `bizzi-db-linux-<sha>` artifact. Do sections 2 to 4 with those packages, except the update rows.
2. **First Linux release.** With the checklist passing, set the repository variable `LINUX_RELEASE_ENABLED=true` just before tagging a normal `vX.Y.Z` release (RELEASING.md). Fill section 1 from that run.
3. **Update rows.** Install that release's `.deb` and AppImage in the matrix environments. When the next plain release ships, accept the in-app update and record the update rows then.
4. **If the first Linux run fails.** The withdraw step removes the Linux packages, their checksums and the `linux-*` keys from `latest.json`, and macOS and Windows stay published. Set `LINUX_RELEASE_ENABLED` back to `false` until the fix lands, and ship Linux with a later release. Never retag.

Tester: ____  linux-bundle run (commit): ____  First Linux release tag: ____  Date: ____

## 1. Release run and CI

| Check | Result |
|---|---|
| `linux-bundle` is green on the release branch | |
| `publish`, `publish-windows` and `publish-linux` are green on the first Linux release | |
| `latest.json` has `linux-x86_64` and `linux-x86_64-deb` | |
| `smoke-linux-distros`: debian:12 | |
| `smoke-linux-distros`: ubuntu:24.04 | |
| `smoke-linux-distros`: fedora:41 | |
| `smoke-linux-distros`: archlinux:latest | |
| Every red smoke row is understood (note the cause) | |

The smoke containers are bare images, so `apps/desktop/scripts/install-smoke-host.sh` first installs the libraries a desktop always has and the AppImage deliberately does not bundle (linuxdeploy's excludelist: fontconfig, freetype, harfbuzz, wayland-client, X11, GL/EGL/gbm and a few more). An `error while loading shared libraries` there means that list is out of date, not that the AppImage is broken.

## 2. Manual matrix

Install the package named for each environment from the `linux-bundle` artifact (`.deb`: `sudo apt install ./Bizzi.DB_<v>_amd64.deb`; AppImage: `chmod +x`, run). For the update rows, install the same format from the first Linux release instead (procedure step 3). The Ctrl+Alt+V check applies to KDE only.

### 2.1 Ubuntu 22.04, GNOME, X11

Package: .deb

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release: `.deb` (pkexec prompt, package upgraded) | |
| Screenshot saved for the side-by-side with macOS | |

### 2.2 Ubuntu 24.04, GNOME, Wayland

Package: .deb, and AppImage with `libfuse2t64` installed

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release: `.deb` (pkexec prompt, package upgraded) | |
| Update to the next release: AppImage (file replaced in place) | |
| Screenshot saved for the side-by-side with macOS | |

### 2.3 Fedora 41, GNOME, Wayland

Package: AppImage

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release: AppImage (file replaced in place) | |
| Screenshot saved for the side-by-side with macOS | |

### 2.4 KDE Plasma 6, Wayland

Package: AppImage

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with KWallet (item visible in KWalletManager) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release: AppImage (file replaced in place) | |
| Screenshot saved for the side-by-side with macOS | |
| Ctrl+Alt+V opens New View | |

### 2.5 Debian 12, XFCE, X11

Package: .deb

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+F5 switches workspace and does not refresh the schema | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release: `.deb` (pkexec prompt, package upgraded) | |
| Screenshot saved for the side-by-side with macOS | |

### 2.6 Machine with the NVIDIA proprietary driver

Package: any package

| Check | Result |
|---|---|
| One header only; caption buttons (minimize, maximize, close) work | |
| Resize from all four edges and corners | |
| Double-click the header maximizes and restores | |
| Edge tiling by dragging; Super+arrows | |
| Dock/taskbar shows the Bizzi DB icon with a single entry | |
| Shortcut map (table below), focus in the data grid | |
| Shortcut map, focus in the SQL editor | |
| Shortcut map, focus in a text input | |
| Ctrl+Alt+→ reaches the desktop, not the app | |
| Ctrl+Shift+R refreshes the schema | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update to the next release with the package installed here (`.deb`: pkexec prompt; AppImage: file replaced) | |
| Screenshot saved for the side-by-side with macOS | |

## 3. Linux shortcut map

Shortcuts are the Windows map except the rows below. Use them in each manual-matrix environment with focus in the grid, the SQL editor and a text input.

| Command | Linux shortcut | Result |
|---|---|---|
| Refresh Schema | Ctrl+Shift+R | |
| Quit | Ctrl+Q | |
| Redo | Ctrl+Shift+Z, or Ctrl+Y in the editor | |
| Close Window | Ctrl+Shift+W | |

Everything else (Settings Ctrl+,, New Query Tab Ctrl+T, Run Ctrl+Enter, Command Palette Ctrl+K, and so on) follows the Windows column of the shortcut map in `docs/superpowers/specs/2026-10-22-windows-support-design.md`. Reserved on Linux, never claimed by a command: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Alt+F4, Alt+Space, Alt+Tab, F10, F12, Ctrl+Escape, Ctrl+Alt+T/L/D/Delete/Escape, Ctrl+Alt+arrows, Ctrl+F1 to Ctrl+F12.

## 4. macOS and Windows regression pass

On the first Linux release, after it is published.

| Check | Result |
|---|---|
| Windows: steps 2 to 4 of the Windows checklist (`docs/windows-verification.md`, not yet in this repo) | |
| macOS: traffic lights | |
| macOS: ⌘ shortcuts | |
| macOS: DMG installs and launches | |
| macOS: in-app update | |
