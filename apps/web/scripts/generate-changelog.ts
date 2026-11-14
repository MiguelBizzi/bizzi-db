// Usage: bun scripts/generate-changelog.ts
// Rewrites changelog.data.ts for the landing page and the desktop app's What's New drawer from CHANGELOG.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChangelog, renderChangelogData } from './changelogMarkdown';

const source = new URL('../../../CHANGELOG.md', import.meta.url);
const targets = ['apps/web/src/lib/changelog.data.ts', 'apps/desktop/src/lib/changelog.data.ts'];

const data = renderChangelogData(parseChangelog(readFileSync(source, 'utf8')));
for (const target of targets) {
  writeFileSync(new URL(`../../../${target}`, import.meta.url), data);
  console.log(`wrote ${target}`);
}
