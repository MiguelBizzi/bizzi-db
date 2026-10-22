// Usage: bun scripts/write-windows-sign-config.ts <out.json>
// Reads AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT and AZURE_SIGNING_PROFILE.
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
await Bun.write(out, JSON.stringify(result.config, null, 2));
console.log(`wrote ${out}`);
