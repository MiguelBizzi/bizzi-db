// Usage: bun scripts/write-windows-sign-config.ts <out.json>
// Reads AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE and the
// AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID secrets. Writes the config only
// when signing is configured, and `signed=true|false` to $GITHUB_OUTPUT when it is set.
import { appendFileSync } from 'node:fs';
import { windowsSignConfig } from './windowsSignConfig';

const out = process.argv[2];
if (!out) {
  console.error('usage: write-windows-sign-config.ts <out.json>');
  process.exit(2);
}

const result = windowsSignConfig(process.env);
if (!result.ok) {
  for (const error of result.errors) console.error(`::error::${error}`);
  process.exit(1);
}
if (result.signed) {
  await Bun.write(out, JSON.stringify(result.config, null, 2));
  console.log(`wrote ${out}`);
} else {
  console.log(
    '::warning title=Windows installer not signed::Azure signing is not configured, so the Windows installer is published unsigned. Updates are still verified with the updater key.',
  );
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `signed=${result.signed}\n`);
