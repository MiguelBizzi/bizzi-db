import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { EXTERNAL_LINKS, REPO_URL } from './externalLinks';

describe('EXTERNAL_LINKS', () => {
  test('the repository is the project on GitHub', () => {
    expect(REPO_URL).toBe('https://github.com/MiguelBizzi/bizzi-db');
  });

  test('has exactly the documentation, release notes and issue links', () => {
    expect(Object.keys(EXTERNAL_LINKS).sort()).toEqual(['docs', 'releaseNotes', 'reportIssue']);
  });

  test('each link is https on github.com inside the project repository', () => {
    for (const href of Object.values(EXTERNAL_LINKS)) {
      const url = new URL(href);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('github.com');
      expect(url.pathname.startsWith('/MiguelBizzi/bizzi-db')).toBe(true);
    }
  });

  test('points each link at its page', () => {
    expect(EXTERNAL_LINKS.docs).toBe('https://github.com/MiguelBizzi/bizzi-db#readme');
    expect(EXTERNAL_LINKS.releaseNotes).toBe('https://github.com/MiguelBizzi/bizzi-db/releases');
    expect(EXTERNAL_LINKS.reportIssue).toBe('https://github.com/MiguelBizzi/bizzi-db/issues/new');
  });
});

describe('opener capability', () => {
  type Permission = string | { identifier: string; allow?: Array<{ url: string }> };
  const capability = JSON.parse(
    readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
  ) as { permissions: Permission[] };

  test('allows opening exactly the external links and grants no other opener permission', () => {
    const opener = capability.permissions.filter((p) =>
      (typeof p === 'string' ? p : p.identifier).startsWith('opener:'),
    );
    expect(opener).toHaveLength(1);
    const [entry] = opener;
    if (typeof entry === 'string') throw new Error('opener permission must carry a URL scope');
    expect(entry.identifier).toBe('opener:allow-open-url');
    expect((entry.allow ?? []).map((a) => a.url).sort()).toEqual(Object.values(EXTERNAL_LINKS).sort());
  });
});
