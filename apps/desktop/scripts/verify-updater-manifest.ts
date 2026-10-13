// Run after a release is published: fails when installed apps could not update.
// Usage: bun scripts/verify-updater-manifest.ts <tag> <owner/repo>
import { validateUpdaterManifest } from './updaterManifest';

const [tag, repo] = process.argv.slice(2);
if (!tag || !repo) {
  console.error('usage: verify-updater-manifest.ts <tag> <owner/repo>');
  process.exit(2);
}

const url = `https://github.com/${repo}/releases/download/${tag}/latest.json`;
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) {
  console.error(`::error::${url} returned HTTP ${response.status}; installed apps cannot update`);
  process.exit(1);
}

const problems = validateUpdaterManifest(await response.json(), tag);
if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::latest.json: ${problem}`);
  process.exit(1);
}
console.log(`latest.json for ${tag} is valid`);
