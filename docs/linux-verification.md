# Linux verification

Manual checklist for a Linux prerelease (`v<next>-rc.1`, then `rc.2` for the update checks). Fill the Result column with pass, fail plus a note, or n/a. Any failure becomes a fix with a reproducing test before the release is enabled (`LINUX_RELEASE_ENABLED`).

Tester: ____  Prerelease tag: ____  Date: ____

## 1. Prerelease and CI

| Check | Result |
|---|---|
| `publish`, `publish-windows` and `publish-linux` are green | |
| `latest.json` has `linux-x86_64` and `linux-x86_64-deb` | |
| `smoke-linux-distros`: debian:12 | |
| `smoke-linux-distros`: ubuntu:24.04 | |
| `smoke-linux-distros`: fedora:41 | |
| `smoke-linux-distros`: archlinux:latest | |
| Every red smoke row is understood (note the cause) | |

## 2. Manual matrix

Install the package named for each environment (`.deb`: `sudo apt install ./Bizzi.DB_<v>_amd64.deb`; AppImage: `chmod +x`, run). The Ctrl+Alt+V check applies to KDE only.

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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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
| Ctrl+F5 and Ctrl+Alt+→ reach the desktop, not the app | |
| Alt tap opens the menu popup | |
| Second launch focuses the running window | |
| Keyring toggle on with GNOME Keyring (item visible in Seahorse) | |
| Keyring toggle disabled with an explanation on a session without a keyring | |
| Postgres TLS `verify-full` to a host with a public CA | |
| SSH tunnel with an Ed25519 key chosen in the file dialog | |
| Copy a cell, paste in another app | |
| Update from rc.1 to rc.2 (`.deb`: pkexec prompt; AppImage: file replaced) | |
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

Same prerelease.

| Check | Result |
|---|---|
| Windows: steps 2 to 4 of the Windows checklist (`docs/windows-verification.md`, not yet in this repo) | |
| macOS: traffic lights | |
| macOS: ⌘ shortcuts | |
| macOS: DMG installs and launches | |
| macOS: in-app update | |
