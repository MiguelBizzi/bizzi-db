const ENDPOINT = /^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/;
const VARIABLES = ['AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE'] as const;
const SECRETS = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'] as const;

export type WindowsSignConfig =
  | { ok: true; signed: true; config: object }
  | { ok: true; signed: false }
  | { ok: false; errors: string[] };

/**
 * Tauri config overlay that signs the NSIS installer and the app with Azure
 * Trusted Signing. Kept out of tauri.conf.json so a local Windows build works
 * unsigned. The endpoint is pinned to Azure so a bad repository variable
 * cannot send the signing credentials elsewhere.
 *
 * With none of the signing variables set, the release ships unsigned: the
 * updater still verifies every update with its own minisign key. Setting only
 * some of them is a mistake and fails, so a half-configured account never
 * silently produces an unsigned build.
 */
export function windowsSignConfig(
  env: Record<string, string | undefined>,
): WindowsSignConfig {
  const value = (name: string) => env[name]?.trim() ?? '';
  if (VARIABLES.every((name) => !value(name))) return { ok: true, signed: false };

  const errors = [...VARIABLES, ...SECRETS]
    .filter((name) => !value(name))
    .map((name) => `${name} is not set`);
  const [endpoint, account, profile] = VARIABLES.map(value);
  if (endpoint && !ENDPOINT.test(endpoint)) {
    errors.push('AZURE_SIGNING_ENDPOINT must look like https://<region>.codesigning.azure.net');
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    signed: true,
    config: {
      bundle: {
        windows: {
          signCommand: {
            cmd: 'trusted-signing-cli',
            args: ['-e', endpoint, '-a', account, '-c', profile, '-d', 'Bizzi DB', '%1'],
          },
        },
      },
    },
  };
}
