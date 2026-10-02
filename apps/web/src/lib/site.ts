export const PRODUCT_NAME = 'Bizzi DB';
export const VERSION = '0.1.0';
export const REPO_URL = 'https://github.com/MiguelBizzi/bizzi-db';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;

export const SITE_TITLE =
  'Bizzi DB — Native Postgres client, built with Rust and Tauri';
export const SITE_DESCRIPTION =
  'A local-first PostgreSQL desktop client. Connections, queries, and SSH run in Rust. The UI is Tauri 2 — a system WebView, not Electron.';

export type DownloadPlatformId = 'macos';

export type DownloadPlatform = {
  id: DownloadPlatformId;
  label: string;
  detail: string;
  href: string;
};

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = [
  {
    id: 'macos',
    label: 'macOS',
    detail: 'Universal DMG',
    href: RELEASES_URL,
  },
];

export function detectPreferredPlatform(
  _userAgent: string,
): DownloadPlatformId {
  return 'macos';
}
