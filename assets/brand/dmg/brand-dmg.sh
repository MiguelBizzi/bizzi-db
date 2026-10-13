#!/usr/bin/env bash
# Finishes a Tauri DMG so it looks the same on every Mac:
#   1. rewrites Finder's window styling (style-dmg.py), because the alias Tauri/Finder records for the
#      background points at the build machine's temporary image and never resolves on a user's Mac;
#   2. names the volume '<product> <version>' so another volume still mounted as 'Bizzi DB' cannot supply its
#      background;
#   3. swaps the stock blue Applications link for an alias carrying the orange folder icon;
#   (Re-creating the image drops Tauri's signature; sign-dmg.sh puts it back.)
# The app bundle is never touched, so its signature, notarization and the updater artifacts stay valid.
# usage: brand-dmg.sh path/to/Bizzi.DB_x.y.z_arch.dmg
set -euo pipefail

dmg="${1:?usage: brand-dmg.sh <file.dmg>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$here/../../.."
icon="$root/apps/desktop/src-tauri/dmg/applications-folder.png"
conf="$root/apps/desktop/src-tauri/tauri.conf.json"
[ -f "$icon" ] || { echo "missing icon: $icon" >&2; exit 1; }
[ -f "$conf" ] || { echo "missing config: $conf" >&2; exit 1; }

work="$(mktemp -d)"
mnt=""
cleanup() {
  if [ -n "$mnt" ]; then hdiutil detach "$mnt" -force >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

# CI passes a prepared interpreter (DMG_PYTHON); a local run builds a throwaway one.
py="${DMG_PYTHON:-}"
if [ -z "$py" ]; then
  python3 -m venv "$work/venv"
  "$work/venv/bin/pip" install --quiet --disable-pip-version-check ds_store==1.3.3 mac_alias==2.2.3
  py="$work/venv/bin/python3"
fi

hdiutil convert "$dmg" -format UDRW -o "$work/rw.dmg" >/dev/null
attach="$(hdiutil attach "$work/rw.dmg" -nobrowse -noverify -noautoopen | grep '/Volumes/' | tail -n 1)"
dev="$(echo "$attach" | awk -F'\t' '{print $1}' | tr -d ' ')"
mnt="$(echo "$attach" | awk -F'\t' '{print $NF}')"
[ -d "$mnt" ] || { echo "could not mount the image" >&2; exit 1; }

# Finder finds the background by volume NAME, so a volume that is still mounted under the same name (an older
# installer left open) supplies its own, possibly outdated, picture. A name that carries the version makes every
# release distinct.
volname="$(python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); print(c["productName"] + " " + c["version"])' "$conf")"
diskutil rename "$dev" "$volname" >/dev/null
mnt="$(diskutil info -plist "$dev" | plutil -extract MountPoint raw -o - -)"
[ -d "$mnt" ] || { echo "could not find the renamed volume" >&2; exit 1; }

[ -e "$mnt/Applications" ] || [ -L "$mnt/Applications" ] || { echo "expected an Applications entry in the DMG" >&2; exit 1; }
rm "$mnt/Applications"
swift "$here/make-alias.swift" "$mnt/Applications" /Applications "$icon"

"$py" "$here/style-dmg.py" "$mnt" "$conf"

sync
hdiutil detach "$mnt" >/dev/null
mnt=""

hdiutil convert "$work/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$work/out.dmg" >/dev/null
mv -f "$work/out.dmg" "$dmg"

echo "branded: $dmg"
