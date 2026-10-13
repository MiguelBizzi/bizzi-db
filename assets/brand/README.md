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

`tauri.conf.json` (`bundle.macOS.dmg`) sets the window to 660×420 pt with the app at (190, 215) and
Applications at (470, 215). Those numbers are mirrored in `DMG` in `generate.mjs`; change both together.

Tauri always draws the stock blue Applications folder. `dmg/brand-dmg.sh <file.dmg>` replaces that link with
a Finder alias to `/Applications` that carries the orange folder icon. It only touches the Applications entry,
never the app bundle, so signing, notarization and updater artifacts stay valid. The release workflow runs it
after `tauri-action` and re-uploads the DMG (best effort: a failure keeps the plain DMG).
