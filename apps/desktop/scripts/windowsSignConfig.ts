const ENDPOINT = /^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/;
const NAMES = ['AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE'] as const;

export type WindowsSignConfig =
  | { ok: true; config: object }
  | { ok: false; errors: string[] };

/**
 * Tauri config overlay that signs the NSIS installer and the app with Azure
 * Trusted Signing. Kept out of tauri.conf.json so a local Windows build works
 * unsigned. The endpoint is pinned to Azure so a bad repository variable
 * cannot send the signing credentials elsewhere.
 */
export function windowsSignConfig(
  env: Record<string, string | undefined>,
): WindowsSignConfig {
  const errors: string[] = [];
  const [endpoint, account, profile] = NAMES.map((name) => {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is not set`);
    return value ?? '';
  });
  if (endpoint && !ENDPOINT.test(endpoint)) {
    errors.push('AZURE_SIGNING_ENDPOINT must look like https://<region>.codesigning.azure.net');
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
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
