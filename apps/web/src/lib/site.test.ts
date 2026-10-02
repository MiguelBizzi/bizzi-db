import { describe, expect, test } from 'bun:test';
import {
  DOWNLOAD_PLATFORMS,
  PRODUCT_NAME,
  RELEASES_URL,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  VERSION,
  detectPreferredPlatform,
} from './site';
import { ARCHITECTURE, CTA, FAQ, FEATURES, PILLARS } from './content';

const BANNED = [
  'homebrew',
  'brew install',
  'winget',
  'yay -s',
  'web studio',
  'interactive studio',
  'mysql',
  'mariadb',
  'clickhouse',
  'turso',
  'redis',
  'duckdb',
  'gemini',
  '1.4.2',
];

function publishedCopy(): string {
  return [
    PRODUCT_NAME,
    VERSION,
    SITE_TITLE,
    SITE_DESCRIPTION,
    ...PILLARS.flatMap((item) => [item.title, item.body, item.footnote]),
    ...FEATURES.flatMap((item) => [item.title, item.body]),
    ...ARCHITECTURE.flatMap((item) => [item.title, item.body]),
    ...FAQ.flatMap((item) => [item.q, item.a]),
    CTA.title,
    CTA.emphasis,
    CTA.body,
  ]
    .join('\n')
    .toLowerCase();
}

describe('site', () => {
  test('ships lockstep version 0.1.0', () => {
    expect(PRODUCT_NAME).toBe('Bizzi DB');
    expect(VERSION).toBe('0.1.0');
  });

  test('download URLs point at GitHub latest releases', () => {
    expect(REPO_URL).toBe('https://github.com/MiguelBizzi/bizzi-db');
    expect(RELEASES_URL).toBe(
      'https://github.com/MiguelBizzi/bizzi-db/releases/latest',
    );
    expect(DOWNLOAD_PLATFORMS).toHaveLength(3);
    for (const platform of DOWNLOAD_PLATFORMS) {
      expect(platform.href).toBe(RELEASES_URL);
    }
    expect(DOWNLOAD_PLATFORMS.map((p) => p.id)).toEqual([
      'macos',
      'windows',
      'linux',
    ]);
  });

  test('does not advertise package-manager installers', () => {
    const hrefs = DOWNLOAD_PLATFORMS.map((p) => p.href).join(' ');
    expect(hrefs.toLowerCase()).not.toContain('brew');
    expect(hrefs.toLowerCase()).not.toContain('winget');
  });

  test('detects a preferred download platform from the user agent', () => {
    expect(
      detectPreferredPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ),
    ).toBe('macos');
    expect(
      detectPreferredPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
    ).toBe('windows');
    expect(detectPreferredPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(
      'linux',
    );
  });
});

describe('content', () => {
  test('does not claim features or installers we do not ship', () => {
    const copy = publishedCopy();
    for (const phrase of BANNED) {
      expect(copy).not.toContain(phrase);
    }
  });

  test('describes Postgres, Rust, and Tauri', () => {
    const copy = publishedCopy();
    expect(copy).toContain('postgres');
    expect(copy).toContain('rust');
    expect(copy).toContain('tauri');
  });

  test('cta says the product is free and completely free', () => {
    const headline = `${CTA.title} ${CTA.emphasis}`.toLowerCase();
    expect(headline).toContain('free');
    expect(headline).toContain('completely free');
    expect(CTA.body.toLowerCase()).toContain('free');
  });
});

describe('index.html SEO', () => {
  test('declares version 0.1.0, JSON-LD, and GitHub releases', async () => {
    const html = await Bun.file(
      new URL('../../index.html', import.meta.url),
    ).text();
    expect(html).toContain('softwareVersion": "0.1.0"');
    expect(html).toContain('SoftwareApplication');
    expect(html).toContain(
      'https://github.com/MiguelBizzi/bizzi-db/releases/latest',
    );
    expect(html).toContain('Postgres');
    expect(html).toContain('Tauri');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
    expect(html).not.toContain('1.4.2');
    expect(html.toLowerCase()).not.toContain('homebrew');
  });
});
