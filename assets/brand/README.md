# Bizzi DB brand

The mark is a **2×2 table shaped like a B**. The row line is the waist of the
letter, the column line separates the stem from the bowls, and the amber lower
bowl is the *selected cell* of a data grid. No cylinder, no stack.

| Token | Value | Use |
| --- | --- | --- |
| Amber | `#d87943` | Selected cell, "DB". Same as `--primary` in the app UI |
| Cream | `#f3ece0` | Mark on dark backgrounds |
| Ink | `#15171c` | Mark on light backgrounds, app icon tile |
| Paper | `#fbf7f0` | Light background |

Wordmark: **Geist Mono SemiBold** (SIL OFL), outlined in the SVGs. "DB" takes the accent colour.

## Files

- `svg/` – source of truth. `mark-*` (mark only), `lockup-horizontal-*`, `lockup-stacked-*`, `app-icon` (macOS, with margin), `app-tile` (full bleed), `favicon`.
  - `on-dark` / `on-light`: full colour. `mono-ink` / `mono-cream` / `mono-amber`: single colour.
- `png/` – fixed-size exports (favicon 16/32/48, app icon up to 1024, marks, lockups).
- `showcase.html` – the logo in context (dock, title bar, favicon, landing hero, light/dark, monochrome).
- `svg/dmg-background.svg`, `svg/applications-folder.svg` – the DMG installer. The background ships as `apps/desktop/src-tauri/dmg/background.tiff` (1x+2x); the orange folder is applied by `dmg/brand-dmg.sh` (see below).
- `generate.mjs` – regenerates everything above, plus `apps/desktop/src-tauri/icons/*` and `apps/web/public/{favicon,apple-touch-icon,app-icon}`.

## Rules

- Clear space: at least the width of the stem (⅓ of the mark width) on all sides.
- Minimum size: 16px (favicon), use `svg/favicon.svg`, which has a larger mark. Below that use the favicon as is.
- Don't recolour individual cells, rotate, outline or add effects. Use a mono version when only one colour is available.
- Inside the apps, use `BrandMark` (it follows the theme: `foreground` + `primary`).

## Regenerating

```sh
mkdir /tmp/brand-tools && cd /tmp/brand-tools
bun add @resvg/resvg-js opentype.js geist
cd - && BRAND_TOOLS=/tmp/brand-tools bun assets/brand/generate.mjs
```

## DMG installer

Layout (window 660×468 including the 28 pt title bar, so the 660×440 background fills it; app at (190, 225),
Applications at (470, 225)) lives in `tauri.conf.json` (`bundle.macOS.dmg`). The same numbers are mirrored in
`DMG` in `generate.mjs`; change both together.

`tauri-action` builds the DMG, then the release workflow runs `dmg/brand-dmg.sh <file.dmg>`, which:

1. replaces Finder's styling (`dmg/style-dmg.py` rewrites `.DS_Store` from `tauri.conf.json`);
2. replaces the stock blue Applications link with an alias carrying the orange folder icon.

Re-creating the image drops the signature Tauri applied, so the workflow then runs `dmg/sign-dmg.sh`, which imports
the Developer ID certificate into a throwaway keychain (the keychain `tauri-action` builds is gone by then) and signs
the DMG. Signing is allowed to fail without blocking the styled DMG; the run shows a warning instead.

The app bundle is never touched, so its signature, notarization and the updater artifacts stay valid.

`dmg/verify-dmg.py <file.dmg> <tauri.conf.json> [--require-app-signature] [--require-dmg-signature]` fails unless the DMG will show the branded
installer. The workflow runs it before upload and again on the asset users download. Run both locally with:

```sh
assets/brand/dmg/brand-dmg.sh path/to/Bizzi.DB.dmg   # needs python3 + network for ds_store, mac_alias
python3 -m venv /tmp/dmg-venv && /tmp/dmg-venv/bin/pip install ds_store==1.3.3 mac_alias==2.2.3
/tmp/dmg-venv/bin/python3 assets/brand/dmg/verify-dmg.py path/to/Bizzi.DB.dmg apps/desktop/src-tauri/tauri.conf.json
```

### Why not trust Tauri's own styling

Tauri styles the DMG by driving Finder with AppleScript on a temporary image. Finder stores the background as an
alias that includes a pointer to that temporary image on the build machine (on CI,
`/Users/runner/work/.../rw.NNNN.Bizzi DB_x.y.z_universal.dmg`). Nobody else has that file, so on every other Mac
Finder cannot resolve the alias and shows a plain window: icons in the right places, no background. The layout
survives because icon positions are stored separately from the alias. `style-dmg.py` writes an alias that only
names the volume and the file inside it.

Rules learned the hard way:

- Keep the label size (`textSize`) at 10 or more. Finder throws away the whole view-options record, background
  included, when it is smaller.
- Finder labels cannot be hidden or recoloured: with a background picture they are always dark, even in dark mode.
  The background therefore draws a light plate behind each label (cream for the app, amber for Applications).
  `DMG.labelY` in `generate.mjs` is where Finder centres the labels at icon size 128 and label size 12; if you
  change either size in `style-dmg.py`, move the plates to match.
- When testing a background change, mount the test DMG under a new volume name. Finder caches the background per
  volume, so an image swapped inside a volume it has already seen keeps showing the old picture.
- Finder resolves the background by volume NAME. If another volume with the same name is still mounted (an older
  installer someone left open), Finder uses that volume's `.background` image instead, so the window shows an old
  design. `brand-dmg.sh` therefore names every release's volume `<productName> <version>` (for example
  "Bizzi DB 0.1.12"), and `style-dmg.py` names the volume explicitly in the alias so the mount path ("Bizzi DB 1")
  never leaks into it.
- Never mark the branding step `continue-on-error`. That is how an unstyled DMG shipped for three releases.
