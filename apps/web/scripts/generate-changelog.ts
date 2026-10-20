// Usage: bun scripts/generate-changelog.ts
// Rewrites src/lib/changelog.data.ts from the repository's CHANGELOG.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChangelog, renderChangelogData } from './changelogMarkdown';

const source = new URL('../../../CHANGELOG.md', import.meta.url);
const target = new URL('../src/lib/changelog.data.ts', import.meta.url);

writeFileSync(target, renderChangelogData(parseChangelog(readFileSync(source, 'utf8'))));
console.log('wrote apps/web/src/lib/changelog.data.ts');
