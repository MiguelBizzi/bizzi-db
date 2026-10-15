import rootPackage from '../../../../package.json';

export const PRODUCT_NAME = 'Bizzi DB';
// Build-time fallback. The live release (see useLatestRelease) overrides it once GitHub answers.
export const VERSION: string = rootPackage.version;
export const REPO_URL = 'https://github.com/MiguelBizzi/bizzi-db';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const ALL_RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_API =
  'https://api.github.com/repos/MiguelBizzi/bizzi-db/releases/latest';
export const SUPPORT_URL = 'https://buymeacoffee.com/miguelbizzi';

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
