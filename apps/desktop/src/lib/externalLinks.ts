/**
 * External pages the app opens in the default browser. Keep in sync with the `opener:allow-open-url`
 * scope in `src-tauri/capabilities/default.json`, which allows exactly these URLs.
 */
export const REPO_URL = 'https://github.com/MiguelBizzi/bizzi-db';

export const EXTERNAL_LINKS = {
  docs: `${REPO_URL}#readme`,
  releaseNotes: `${REPO_URL}/releases`,
  reportIssue: `${REPO_URL}/issues/new`,
} as const;

export type ExternalLinkId = keyof typeof EXTERNAL_LINKS;
