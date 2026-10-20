// Usage: bun apps/web/scripts/release-notes.ts <version>
// Prints the CHANGELOG.md notes for one version (no leading "v"). Fails when the section is missing or empty,
// so a tag pushed without release notes stops before anything is built.
import { readFileSync } from 'node:fs';
import { extractReleaseNotes } from './changelogMarkdown';

const version = process.argv[2];
if (!version) {
  console.error('usage: release-notes.ts <version>');
  process.exit(2);
}

try {
  const markdown = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
  process.stdout.write(extractReleaseNotes(markdown, version));
} catch (error) {
  console.error(`::error::${(error as Error).message}`);
  process.exit(1);
}
