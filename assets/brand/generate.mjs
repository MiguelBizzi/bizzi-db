// Generates every Bizzi DB brand asset from the "Cell B" geometry below.
// Run: BRAND_TOOLS=<dir with @resvg/resvg-js, opentype.js and geist> bun assets/brand/generate.mjs
// macOS only: uses iconutil, sips and tiffutil.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const toolsDir = process.env.BRAND_TOOLS;
if (!toolsDir) throw new Error('Set BRAND_TOOLS to a directory with @resvg/resvg-js, opentype.js and geist installed');
const req = createRequire(path.join(path.resolve(toolsDir), 'noop.js'));
const { Resvg } = req('@resvg/resvg-js');
const opentype = req('opentype.js');

const COLOR = {
  cream: '#f3ece0',
  amber: '#d87943', // --primary in the app UI
  ink: '#15171c',
  paper: '#fbf7f0',
};

// A 2x2 table: the row gap is the waist of the B, and the amber lower bowl is the selected cell.
const G = { gap: 22, H: 560, stem: 150, bowlTop: 190, bowlBottom: 232, R: 44, r: 14 };
const MW = G.stem + G.gap + G.bowlBottom;
const MH = G.H;

function rrect(x, y, w, h, [tl, tr, br, bl]) {
  const a = (r, dx, dy) => (r ? `A${r},${r} 0 0 1 ${x + dx},${y + dy}` : '');
  return (
    `M${x + tl},${y}H${x + w - tr}${a(tr, w, tr)}V${y + h - br}` +
    `${a(br, w - br, h)}H${x + bl}${a(bl, 0, h - bl)}V${y + tl}${a(tl, tl, 0)}Z`
  );
}

function cells(x0 = 0, y0 = 0) {
  const { gap, H, stem, bowlTop, bowlBottom, R, r } = G;
  const rh = (H - gap) / 2;
  const rr = rh / 2;
  const xb = x0 + stem + gap;
  const y2 = y0 + rh + gap;
  return [
    rrect(x0, y0, stem, rh, [R, r, r, r]),
    rrect(x0, y2, stem, rh, [r, r, r, R]),
    rrect(xb, y0, bowlTop, rh, [r, rr, rr, r]),
    rrect(xb, y2, bowlBottom, rh, [r, rr, rr, r]),
  ];
}

// fills: [stemTop, stemBottom, bowlTop, bowlBottom]
function markPaths(fills, x0 = 0, y0 = 0) {
  return cells(x0, y0)
    .map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`)
    .join('');
}

const FILLS = {
  onDark: [COLOR.cream, COLOR.cream, COLOR.cream, COLOR.amber],
  onLight: [COLOR.ink, COLOR.ink, COLOR.ink, COLOR.amber],
  mono: (c) => [c, c, c, c],
};

const fontBuf = fs.readFileSync(
  path.join(path.resolve(toolsDir), 'node_modules/geist/dist/fonts/geist-mono/GeistMono-SemiBold.ttf'),
);
const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength));

// opentype's toPathData returned NaN coordinates for some glyphs here, so serialise directly.
function pathData(p) {
  const n = (v) => {
    if (!Number.isFinite(v)) throw new Error('Non-finite glyph coordinate');
    return +v.toFixed(2);
  };
  return p.commands
    .map((c) => {
      switch (c.type) {
        case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z': return 'Z';
        default: throw new Error(`Unknown path command ${c.type}`);
      }
    })
    .join('');
}

function wordmark({ x, baseline, size, fill, dbFill }) {
  const scale = size / font.unitsPerEm;
  const tracking = size * 0.02;
  const text = 'Bizzi DB';
  let cx = x;
  let svg = '';
  [...text].forEach((ch, i) => {
    const glyph = font.charToGlyph(ch);
    if (ch !== ' ') {
      svg += `<path d="${pathData(glyph.getPath(cx, baseline, size))}" fill="${i >= 6 ? dbFill : fill}"/>`;
    }
    cx += glyph.advanceWidth * scale * (ch === ' ' ? 0.62 : 1) + tracking;
  });
  return { svg, width: cx - x - tracking, capH: font.tables.os2.sCapHeight * scale };
}

const loadFont = (weight) => {
  const buf = fs.readFileSync(
    path.join(path.resolve(toolsDir), `node_modules/geist/dist/fonts/geist-mono/GeistMono-${weight}.ttf`),
  );
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const fontMedium = loadFont('Medium');

function centeredText(str, cx, baseline, size, fill, opacity = 1) {
  const scale = size / fontMedium.unitsPerEm;
  const width = [...str].reduce((w, ch) => w + fontMedium.charToGlyph(ch).advanceWidth * scale, 0);
  let x = cx - width / 2;
  let svg = '';
  for (const ch of str) {
    const glyph = fontMedium.charToGlyph(ch);
    if (ch !== ' ') svg += `<path d="${pathData(glyph.getPath(x, baseline, size))}" fill="${fill}" fill-opacity="${opacity}"/>`;
    x += glyph.advanceWidth * scale;
  }
  return svg;
}

const svgDoc = (w, h, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra}>${inner}</svg>\n`;

function markSvg(fills, label = 'Bizzi DB') {
  return svgDoc(MW, MH, markPaths(fills), ` role="img" aria-label="${label}"`);
}

function horizontalLockup({ markFills, textFill, dbFill }) {
  const size = MH * 0.5;
  const gap = 120;
  const probe = wordmark({ x: 0, baseline: 0, size, fill: '#000', dbFill: '#000' });
  const baseline = MH / 2 + probe.capH / 2;
  const w = wordmark({ x: MW + gap, baseline, size, fill: textFill, dbFill });
  return svgDoc(MW + gap + w.width, MH, markPaths(markFills) + w.svg, ' role="img" aria-label="Bizzi DB"');
}

function stackedLockup({ markFills, textFill, dbFill }) {
  const size = MH * 0.34;
  const gap = 120;
  const probe = wordmark({ x: 0, baseline: 0, size, fill: '#000', dbFill: '#000' });
  const W = Math.max(MW, probe.width);
  const baseline = MH + gap + probe.capH;
  const w = wordmark({ x: (W - probe.width) / 2, baseline, size, fill: textFill, dbFill });
  return svgDoc(W, baseline + 6, markPaths(markFills, (W - MW) / 2) + w.svg, ' role="img" aria-label="Bizzi DB"');
}

function tileSvg({ inset = 0, radiusRatio = 0.225, markH = 0.5, flat = false, square = false }) {
  const body = 1024 - inset * 2;
  const rx = square ? 0 : body * radiusRatio;
  const mh = body * markH;
  const k = mh / MH;
  const mx = 512 - (MW * k) / 2 - 4 * k; // optical centring: the bowls are heavier on the right
  const my = 512 - mh / 2;
  const defs = flat
    ? ''
    : `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2027"/><stop offset="1" stop-color="#111317"/></linearGradient></defs>`;
  const bg = `<rect x="${inset}" y="${inset}" width="${body}" height="${body}" rx="${rx}" fill="${flat ? COLOR.ink : 'url(#bg)'}"/>`;
  const rim = flat
    ? ''
    : `<rect x="${inset + 1}" y="${inset + 1}" width="${body - 2}" height="${body - 2}" rx="${rx - 1}" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="2"/>`;
  const mark = `<g transform="translate(${mx},${my}) scale(${k})">${markPaths(FILLS.onDark)}</g>`;
  return svgDoc(1024, 1024, defs + bg + rim + mark, ' role="img" aria-label="Bizzi DB"');
}

const out = (rel, data) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
};
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();

const svgs = {
  'mark-on-dark': markSvg(FILLS.onDark),
  'mark-on-light': markSvg(FILLS.onLight),
  'mark-mono-ink': markSvg(FILLS.mono(COLOR.ink)),
  'mark-mono-cream': markSvg(FILLS.mono(COLOR.cream)),
  'mark-mono-amber': markSvg(FILLS.mono(COLOR.amber)),
  'lockup-horizontal-on-dark': horizontalLockup({ markFills: FILLS.onDark, textFill: COLOR.cream, dbFill: COLOR.amber }),
  'lockup-horizontal-on-light': horizontalLockup({ markFills: FILLS.onLight, textFill: COLOR.ink, dbFill: COLOR.amber }),
  'lockup-horizontal-mono-ink': horizontalLockup({ markFills: FILLS.mono(COLOR.ink), textFill: COLOR.ink, dbFill: COLOR.ink }),
  'lockup-horizontal-mono-cream': horizontalLockup({ markFills: FILLS.mono(COLOR.cream), textFill: COLOR.cream, dbFill: COLOR.cream }),
  'lockup-stacked-on-dark': stackedLockup({ markFills: FILLS.onDark, textFill: COLOR.cream, dbFill: COLOR.amber }),
  'lockup-stacked-on-light': stackedLockup({ markFills: FILLS.onLight, textFill: COLOR.ink, dbFill: COLOR.amber }),
};
for (const [name, svg] of Object.entries(svgs)) out(`assets/brand/svg/${name}.svg`, svg);

const appIcon = tileSvg({ inset: 100, radiusRatio: 0.225, markH: 0.56 });
const appTile = tileSvg({ inset: 0, radiusRatio: 0.225, markH: 0.54 });
const favicon = tileSvg({ inset: 0, radiusRatio: 0.2, markH: 0.64, flat: true });
const touch = tileSvg({ inset: 0, markH: 0.54, square: true });
out('assets/brand/svg/app-icon.svg', appIcon);
out('assets/brand/svg/app-tile.svg', appTile);
out('assets/brand/svg/favicon.svg', favicon);

for (const [name, svg, widths] of [
  ['app-icon', appIcon, [1024, 512, 256]],
  ['app-tile', appTile, [512, 256]],
  ['mark-on-dark', svgs['mark-on-dark'], [512]],
  ['mark-on-light', svgs['mark-on-light'], [512]],
  ['lockup-horizontal-on-dark', svgs['lockup-horizontal-on-dark'], [1600]],
  ['lockup-horizontal-on-light', svgs['lockup-horizontal-on-light'], [1600]],
  ['lockup-stacked-on-dark', svgs['lockup-stacked-on-dark'], [1000]],
  ['lockup-stacked-on-light', svgs['lockup-stacked-on-light'], [1000]],
]) {
  for (const w of widths) out(`assets/brand/png/${name}-${w}.png`, png(svg, w));
}
for (const w of [16, 32, 48]) out(`assets/brand/png/favicon-${w}.png`, png(favicon, w));

out('apps/web/public/favicon.svg', favicon);
out('apps/web/public/favicon.png', png(favicon, 48));
out('apps/web/public/apple-touch-icon.png', png(touch, 180));
out('apps/web/public/app-icon.svg', appIcon);

const icons = 'apps/desktop/src-tauri/icons';
out(`${icons}/32x32.png`, png(appTile, 32));
out(`${icons}/128x128.png`, png(appTile, 128));
out(`${icons}/128x128@2x.png`, png(appTile, 256));
out(`${icons}/icon.png`, png(appIcon, 512));

const iconset = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bizzi-iconset-')), 'icon.iconset');
fs.mkdirSync(iconset);
for (const s of [16, 32, 128, 256, 512]) {
  fs.writeFileSync(path.join(iconset, `icon_${s}x${s}.png`), png(appIcon, s));
  fs.writeFileSync(path.join(iconset, `icon_${s}x${s}@2x.png`), png(appIcon, s * 2));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, `${icons}/icon.icns`)]);

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const frames = icoSizes.map((s) => png(appTile, s));
const head = Buffer.alloc(6 + 16 * frames.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(frames.length, 4);
let offset = head.length;
frames.forEach((buf, i) => {
  const s = icoSizes[i];
  const p = 6 + i * 16;
  head.writeUInt8(s === 256 ? 0 : s, p);
  head.writeUInt8(s === 256 ? 0 : s, p + 1);
  head.writeUInt16LE(1, p + 4);
  head.writeUInt16LE(32, p + 6);
  head.writeUInt32LE(buf.length, p + 8);
  head.writeUInt32LE(offset, p + 12);
  offset += buf.length;
});
out(`${icons}/icon.ico`, Buffer.concat([head, ...frames]));

// Orange Applications folder: the custom icon of the Applications alias (see dmg/brand-dmg.sh).
function applicationsFolderSvg() {
  const k = 250 / MH;
  const mx = 512 - (MW * k) / 2;
  const my = 590 - 250 / 2;
  const mark = markPaths(['#f3ece0', '#f3ece0', '#f3ece0', '#fffaf2']);
  return svgDoc(
    1024,
    1024,
    `<defs>
      <linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4571f"/><stop offset="1" stop-color="#9c4418"/></linearGradient>
      <linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4a06a"/><stop offset=".55" stop-color="#e4864f"/><stop offset="1" stop-color="#d06f38"/></linearGradient>
      <filter id="blur" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <ellipse cx="512" cy="850" rx="370" ry="36" fill="#000" fill-opacity=".38" filter="url(#blur)"/>
    <path d="M140,196H372Q404,196 424,220L446,246Q458,260 478,260H884Q912,260 912,288V792Q912,820 884,820H140Q112,820 112,792V224Q112,196 140,196Z" fill="url(#back)"/>
    <rect x="150" y="296" width="724" height="120" rx="18" fill="#f3ece0"/>
    <rect x="176" y="324" width="400" height="14" rx="7" fill="#15171c" fill-opacity=".14"/>
    <rect x="176" y="354" width="260" height="14" rx="7" fill="#15171c" fill-opacity=".10"/>
    <rect x="112" y="344" width="800" height="476" rx="40" fill="url(#front)"/>
    <path d="M152,344H872Q912,344 912,384" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>
    <g transform="translate(${mx},${my}) scale(${k})" opacity=".92">${mark}</g>`,
    ' role="img" aria-label="Applications"',
  );
}
const folder = applicationsFolderSvg();
out('assets/brand/svg/applications-folder.svg', folder);
out('assets/brand/png/applications-folder-1024.png', png(folder, 1024));

// DMG installer background. Window and icon positions live in tauri.conf.json (bundle.macOS.dmg).
// labelY is where Finder centres the icon labels (icon size 128, label size 12); the plates sit behind them.
const DMG = { w: 660, h: 440, iconY: 225, appX: 190, appsX: 470, labelY: 308 };
function dmgBackgroundSvg() {
  const { w, h, iconY, appX, appsX, labelY } = DMG;
  const lockup = svgs['lockup-horizontal-on-dark'];
  const [, lw, lh] = lockup.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const lk = 54 / lh;
  const lockInner = lockup.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  const cell = (cx, selected) =>
    `<rect x="${cx - 88}" y="${iconY - 84}" width="176" height="198" rx="22" fill="${selected ? 'rgba(216,121,67,.09)' : 'rgba(255,255,255,.04)'}" stroke="${selected ? COLOR.amber : 'rgba(255,255,255,.14)'}" stroke-width="${selected ? 1.5 : 1}"/>`;
  const mid = (appX + appsX) / 2;
  const dots = [-18, -9, 0, 9].map((dx, i) => `<circle cx="${mid + dx - 4}" cy="${iconY}" r="1.7" fill="${COLOR.amber}" fill-opacity="${0.3 + i * 0.22}"/>`).join('');
  const chevron = `<path d="M${mid + 10} ${iconY - 6}L${mid + 17} ${iconY}L${mid + 10} ${iconY + 6}" fill="none" stroke="${COLOR.amber}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Finder draws the icon labels itself, always in dark text, and a DMG cannot recolour them. So the labels get a
  // light plate to sit on (cream for the app, amber for the selected Applications cell) and the captions go above.
  const plate = (cx, selected) => {
    const pw = 120, ph = 28, x = cx - pw / 2, y = labelY - ph / 2;
    const fill = selected ? COLOR.amber : COLOR.cream;
    return (
      `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${fill}" filter="url(#plateShadow)"/>` +
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${pw - 1}" height="${ph - 1}" rx="${(ph - 1) / 2}" fill="none" stroke="#ffffff" stroke-opacity="${selected ? 0.35 : 0.7}"/>`
    );
  };
  const defs = '<defs><filter id="plateShadow" x="-30%" y="-60%" width="160%" height="260%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.5"/></filter></defs>';
  const labels =
    centeredText('1 · Drag', appX, iconY - 84 - 14, 12, '#ffffff', 0.6) +
    centeredText('2 · Drop', appsX, iconY - 84 - 14, 12, COLOR.amber, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="#0c0d10"/>
${defs}
<g transform="translate(${(w - lw * lk) / 2},40) scale(${lk})">${lockInner}</g>
${cell(appX, false)}${cell(appsX, true)}
${plate(appX, false)}${plate(appsX, true)}
<rect x="${appsX + 88 - 5}" y="${iconY + 114 - 5}" width="10" height="10" rx="2" fill="${COLOR.amber}" stroke="#0c0d10" stroke-width="2"/>
${labels}${dots}${chevron}
${centeredText("Drag to Applications — that's the whole install.", w / 2, iconY + 156, 13, COLOR.cream, 0.82)}
</svg>
`;
}
const dmgBg = dmgBackgroundSvg();
out('assets/brand/svg/dmg-background.svg', dmgBg);
{
  // 1x and 2x in one TIFF so Finder is sharp on Retina.
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bizzi-dmg-'));
  const one = path.join(dir, 'bg.png');
  const two = path.join(dir, 'bg@2x.png');
  fs.writeFileSync(one, png(dmgBg, DMG.w));
  fs.writeFileSync(two, png(dmgBg, DMG.w * 2));
  execFileSync('sips', ['-s', 'dpiWidth', '72', '-s', 'dpiHeight', '72', '-s', 'format', 'tiff', one, '--out', path.join(dir, 'bg1.tiff')], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'dpiWidth', '144', '-s', 'dpiHeight', '144', '-s', 'format', 'tiff', two, '--out', path.join(dir, 'bg2.tiff')], { stdio: 'ignore' });
  fs.mkdirSync(path.join(root, 'apps/desktop/src-tauri/dmg'), { recursive: true });
  execFileSync('tiffutil', ['-cathidpicheck', path.join(dir, 'bg1.tiff'), path.join(dir, 'bg2.tiff'), '-out', path.join(root, 'apps/desktop/src-tauri/dmg/background.tiff')]);
  out('apps/desktop/src-tauri/dmg/applications-folder.png', png(folder, 1024));
}

// Path data for apps/*/src/components/BrandMark.tsx.
const [a, b, c, d] = cells();
console.log(JSON.stringify({ viewBox: `0 0 ${MW} ${MH}`, stemTop: a, stemBottom: b, bowlTop: c, bowlBottom: d }, null, 2));
