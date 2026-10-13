#!/usr/bin/env python3
"""Writes Finder's window styling (background, icon positions, window size) into a mounted DMG.

Why this exists: Tauri styles the DMG by driving Finder with AppleScript on a temporary read-write image.
Finder then stores the background as an alias that points at that temporary image on the BUILD machine
(for CI: /Users/runner/work/.../rw.NNNN.Bizzi DB_x.y.z_universal.dmg). That path exists on no user's Mac, so
Finder cannot resolve the alias and falls back to a plain window. This script replaces the whole `.DS_Store`
with one whose alias only names the volume and the file inside it, which resolves on every Mac.

Layout comes from tauri.conf.json (bundle.macOS.dmg) so there is a single source of truth.

usage: style-dmg.py <mountpoint> <tauri.conf.json>
Requires: pip install ds_store mac_alias
"""
import glob
import json
import os
import plistlib
import subprocess
import sys

from ds_store import DSStore
from mac_alias import Alias

# Finder discards the entire view-options record (background and icon size included) when the label size is
# below its own minimum (10), so never go lower. The background draws a plate where these labels land, so a
# change here must be mirrored by DMG.labelY in assets/brand/generate.mjs.
LABEL_SIZE = 12.0
ICON_SIZE = 128.0


def volume_name(mount):
    info = subprocess.run(
        ["diskutil", "info", "-plist", mount], check=True, capture_output=True
    ).stdout
    return plistlib.loads(info)["VolumeName"]


def only(pattern, what):
    found = glob.glob(pattern)
    if len(found) != 1:
        sys.exit(f"expected exactly one {what} matching {pattern}, found {len(found)}")
    return found[0]


def main(mount, conf_path):
    with open(conf_path) as fh:
        dmg = json.load(fh)["bundle"]["macOS"]["dmg"]

    name = volume_name(mount)
    background = only(os.path.join(mount, ".background", "*"), "background image")
    app = os.path.basename(only(os.path.join(mount, "*.app"), "app bundle"))
    if not os.path.lexists(os.path.join(mount, "Applications")):
        sys.exit("the volume has no Applications entry")

    width, height = dmg["windowSize"]["width"], dmg["windowSize"]["height"]
    icons = {
        app: (dmg["appPosition"]["x"], dmg["appPosition"]["y"]),
        "Applications": (
            dmg["applicationFolderPosition"]["x"],
            dmg["applicationFolderPosition"]["y"],
        ),
    }

    # Name the volume explicitly instead of trusting the mount path, which is "<name> 1" when another volume
    # with the same name is already mounted (a local run, a stale mount).
    alias = Alias.for_file(background)
    alias.volume.name = name
    alias.volume.posix_path = "/Volumes/" + name
    alias.target.carbon_path = (
        name.encode("mac_roman") + b":.background:\x00" + os.path.basename(background).encode("mac_roman")
    )
    alias_bytes = alias.to_bytes()

    ds_path = os.path.join(mount, ".DS_Store")
    if os.path.exists(ds_path):
        os.remove(ds_path)

    with DSStore.open(ds_path, "w+") as ds:
        ds["."]["vSrn"] = ("long", 1)
        ds["."]["bwsp"] = {
            "ShowStatusBar": False,
            "ShowToolbar": False,
            "ShowPathbar": False,
            "ShowSidebar": False,
            "ShowTabView": False,
            "ContainerShowSidebar": False,
            "PreviewPaneVisibility": False,
            "SidebarWidth": 0,
            "WindowBounds": "{{10, 240}, {%d, %d}}" % (width, height),
        }
        ds["."]["icvp"] = {
            "viewOptionsVersion": 1,
            "backgroundType": 2,
            "backgroundImageAlias": alias_bytes,
            "backgroundColorRed": 1.0,
            "backgroundColorGreen": 1.0,
            "backgroundColorBlue": 1.0,
            "gridOffsetX": 0.0,
            "gridOffsetY": 0.0,
            "gridSpacing": 100.0,
            "arrangeBy": "none",
            "showIconPreview": True,
            "showItemInfo": False,
            "labelOnBottom": True,
            "textSize": LABEL_SIZE,
            "iconSize": ICON_SIZE,
            "scrollPositionX": 0.0,
            "scrollPositionY": 0.0,
        }
        ds["."]["vstl"] = ("type", "icnv")
        for item, (x, y) in icons.items():
            ds[item]["Iloc"] = (x, y)

    print(f"styled '{name}': {width}x{height}, {app} at {icons[app]}, Applications at {icons['Applications']}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
