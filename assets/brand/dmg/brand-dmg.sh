#!/usr/bin/env bash
# Swaps the stock Applications link in a Tauri DMG for an alias with the orange folder icon.
# Only the link changes; the app bundle, its signature and the updater artifacts stay untouched.
# usage: brand-dmg.sh path/to/Bizzi.DB_x.y.z_arch.dmg
set -euo pipefail

dmg="${1:?usage: brand-dmg.sh <file.dmg>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
icon="$here/../../../apps/desktop/src-tauri/dmg/applications-folder.png"
[ -f "$icon" ] || { echo "missing icon: $icon" >&2; exit 1; }

work="$(mktemp -d)"
mnt="$work/mnt"
mkdir "$mnt"
attached=0
cleanup() {
  if [ "$attached" = 1 ]; then hdiutil detach "$mnt" -force >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

hdiutil convert "$dmg" -format UDRW -o "$work/rw.dmg" >/dev/null
hdiutil attach "$work/rw.dmg" -mountpoint "$mnt" -nobrowse -noverify -noautoopen >/dev/null
attached=1

[ -e "$mnt/Applications" ] || [ -L "$mnt/Applications" ] || { echo "expected an Applications entry in the DMG" >&2; exit 1; }
rm "$mnt/Applications"
swift "$here/make-alias.swift" "$mnt/Applications" /Applications "$icon"

# Shrink Finder's own icon labels (black in light mode, unreadable on the dark background).
# textSize is a float(16.0) in the icvp plist; patching it in place keeps the sizes intact.
python3 - "$mnt/.DS_Store" <<'PY'
import struct, sys
path = sys.argv[1]
data = bytearray(open(path, 'rb').read())
start = data.find(b'icvp')
size = b'\x23' + struct.pack('>d', 16.0)
pos = data.find(size, start) if start >= 0 else -1
if pos < 0 or pos > start + 1200:
    sys.exit('could not find textSize in .DS_Store; labels keep their default size')
data[pos + 1:pos + 9] = struct.pack('>d', 1.0)
open(path, 'wb').write(data)
PY

sync
hdiutil detach "$mnt" >/dev/null
attached=0

hdiutil convert "$work/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$work/out.dmg" >/dev/null
mv -f "$work/out.dmg" "$dmg"
echo "branded: $dmg"
