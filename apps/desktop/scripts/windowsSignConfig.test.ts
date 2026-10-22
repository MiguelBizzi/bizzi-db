import { describe, expect, test } from 'bun:test';
import { windowsSignConfig } from './windowsSignConfig';

const vars = {
  AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net',
  AZURE_SIGNING_ACCOUNT: 'bizzi-signing',
  AZURE_SIGNING_PROFILE: 'bizzi-public',
};
const secrets = {
  AZURE_CLIENT_ID: 'client',
  AZURE_CLIENT_SECRET: 'secret',
  AZURE_TENANT_ID: 'tenant',
};
const env = { ...vars, ...secrets };

describe('windowsSignConfig', () => {
  test('builds the tauri signCommand from the signing variables', () => {
    expect(windowsSignConfig(env)).toEqual({
      ok: true,
      signed: true,
      config: {
        bundle: {
          windows: {
            signCommand: {
              cmd: 'trusted-signing-cli',
              args: [
                '-e', env.AZURE_SIGNING_ENDPOINT,
                '-a', env.AZURE_SIGNING_ACCOUNT,
                '-c', env.AZURE_SIGNING_PROFILE,
                '-d', 'Bizzi DB',
                '%1',
              ],
            },
          },
        },
      },
    });
  });

  test('is unsigned when no signing variable is set', () => {
    expect(windowsSignConfig({})).toEqual({ ok: true, signed: false });
    expect(windowsSignConfig({ AZURE_SIGNING_ENDPOINT: ' ', AZURE_SIGNING_ACCOUNT: '' })).toEqual({
      ok: true,
      signed: false,
    });
  });

  test('ignores leftover Azure secrets when signing is not configured', () => {
    expect(windowsSignConfig(secrets)).toEqual({ ok: true, signed: false });
  });

  test.each(Object.keys(env))('names %s when it is missing or blank', (name) => {
    for (const value of [undefined, '  ']) {
      const result = windowsSignConfig({ ...env, [name]: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain(name);
      }
    }
  });

  test('reports every missing value once signing is partly configured', () => {
    const result = windowsSignConfig({ AZURE_SIGNING_ACCOUNT: 'bizzi-signing' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(5);
  });

  test('never puts a secret value in an error', () => {
    const result = windowsSignConfig({ ...env, AZURE_SIGNING_ENDPOINT: 'https://evil.example' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const value of Object.values(secrets)) expect(result.errors.join('\n')).not.toContain(value);
    }
  });

  test.each([
    'http://eus.codesigning.azure.net',
    'https://evil.example',
    'https://eus.codesigning.azure.net.evil.example',
    'https://eus.codesigning.azure.net/path',
  ])('rejects endpoint %s', (endpoint) => {
    const result = windowsSignConfig({ ...env, AZURE_SIGNING_ENDPOINT: endpoint });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('AZURE_SIGNING_ENDPOINT');
  });

  test('accepts a trailing slash on the endpoint', () => {
    const result = windowsSignConfig({
      ...env,
      AZURE_SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net/',
    });
    expect(result.ok && result.signed).toBe(true);
  });
});
