#!/usr/bin/env python3
"""Fails unless a DMG will show the branded installer on any Mac.

Mounts the image read-only and checks the things that have broken the installer before:
  - the background image is on the volume and is the one in the repo;
  - the background alias names this volume and file, with no pointer to a build-machine image
    (that pointer is what made the background vanish for every user);
  - the view options Finder keeps are valid (an undersized label silently discards the whole record);
  - window size and icon positions match tauri.conf.json;
  - the Applications entry is an alias, not the stock link;
  - optionally, the app and the DMG carry valid code signatures.

usage: verify-dmg.py <file.dmg> <tauri.conf.json> [--require-signature]
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

failures = []


def check(ok, message):
    print(("  ok    " if ok else "  FAIL  ") + message)
    if not ok:
        failures.append(message)


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main(dmg, conf_path, require_signature):
    here = os.path.dirname(os.path.abspath(__file__))
    with open(conf_path) as fh:
        cfg = json.load(fh)["bundle"]["macOS"]["dmg"]
    repo_background = os.path.join(os.path.dirname(os.path.abspath(conf_path)), cfg["background"])

    attach = subprocess.run(
        ["hdiutil", "attach", dmg, "-readonly", "-nobrowse", "-noverify", "-noautoopen"],
        capture_output=True,
        text=True,
    )
    if attach.returncode != 0:
        sys.exit(f"cannot mount {dmg}: {attach.stderr.strip()}")
    mount = [l.split("\t")[-1].strip() for l in attach.stdout.splitlines() if "/Volumes/" in l][-1]
    try:
        verify(dmg, mount, cfg, repo_background, require_signature)
    finally:
        subprocess.run(["hdiutil", "detach", mount, "-force"], capture_output=True)


def verify(dmg, mount, cfg, repo_background, require_signature):
    print(f"verifying {os.path.basename(dmg)} (mounted at {mount})")
    info = plistlib.loads(subprocess.run(["diskutil", "info", "-plist", mount], capture_output=True).stdout)
    name = info["VolumeName"]

    backgrounds = glob.glob(os.path.join(mount, ".background", "*"))
    check(len(backgrounds) == 1, "exactly one image in .background")
    background = backgrounds[0] if backgrounds else None
    if background:
        with open(background, "rb") as a, open(repo_background, "rb") as b:
            check(a.read() == b.read(), "background image is the one in the repo")

    apps = glob.glob(os.path.join(mount, "*.app"))
    check(len(apps) == 1, "exactly one app bundle")
    app = os.path.basename(apps[0]) if apps else None

    ds_path = os.path.join(mount, ".DS_Store")
    check(os.path.isfile(ds_path), ".DS_Store exists")
    if os.path.isfile(ds_path) and background and app:
        with DSStore.open(ds_path, "r") as ds:
            icvp = ds["."]["icvp"]
            bwsp = ds["."]["bwsp"]
            check(icvp.get("backgroundType") == 2, "background type is 'picture'")
            check(icvp.get("textSize", 0) >= 10, f"label size {icvp.get('textSize')} is at least 10")
            check(icvp.get("iconSize") == 128.0, "icon size is 128")
            want = "{{10, 240}, {%d, %d}}" % (cfg["windowSize"]["width"], cfg["windowSize"]["height"])
            check(bwsp.get("WindowBounds") == want, f"window bounds are {want}")
            for item, pos in (
                (app, cfg["appPosition"]),
                ("Applications", cfg["applicationFolderPosition"]),
            ):
                try:
                    got = tuple(ds[item]["Iloc"][:2])
                except Exception as exc:  # a .DS_Store written by Finder can trip the parser
                    check(False, f"{item} position is readable ({exc})")
                    continue
                check(got == (pos["x"], pos["y"]), f"{item} sits at ({pos['x']}, {pos['y']})")

            alias = Alias.from_bytes(bytes(icvp["backgroundImageAlias"]))
            check(alias.volume.disk_image_alias is None, "background alias has no pointer to a build-machine image")
            check(alias.volume.disk_type == 0, "background alias points at a plain volume")
            check(alias.volume.name == name, f"background alias names the volume '{name}'")
            check(
                alias.target.posix_path == "/.background/" + os.path.basename(background),
                "background alias path is inside the volume",
            )
            check(alias.target.cnid == os.stat(background).st_ino, "background alias file id matches the file")
            check(
                alias.target.folder_cnid == os.stat(os.path.dirname(background)).st_ino,
                "background alias folder id matches the folder",
            )

    applications = os.path.join(mount, "Applications")
    finder_info = run("xattr", "-px", "com.apple.FinderInfo", applications).stdout.split()
    check(finder_info[:4] == ["66", "64", "72", "70"], "Applications is a Finder alias with a custom icon, not the stock link")

    if require_signature and apps:
        r = run("codesign", "--verify", "--deep", "--strict", apps[0])
        check(r.returncode == 0, "app bundle signature is valid" + ("" if r.returncode == 0 else f": {r.stderr.strip()}"))
        r = run("codesign", "--verify", "--strict", dmg)
        check(r.returncode == 0, "DMG is code-signed" + ("" if r.returncode == 0 else f": {r.stderr.strip()}"))

    if failures:
        sys.exit(f"\n{len(failures)} check(s) failed: this DMG would not show the branded installer.")
    print("DMG verified.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], "--require-signature" in sys.argv)
