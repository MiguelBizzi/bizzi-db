import { describe, expect, test } from 'bun:test';
import { windowsSignConfig } from './windowsSignConfig';

const env = {
  AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net',
  AZURE_SIGNING_ACCOUNT: 'bizzi-signing',
  AZURE_SIGNING_PROFILE: 'bizzi-public',
};

describe('windowsSignConfig', () => {
  test('builds the tauri signCommand from the signing variables', () => {
    expect(windowsSignConfig(env)).toEqual({
      ok: true,
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

  test('reports every missing variable', () => {
    const result = windowsSignConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(3);
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
    expect(result.ok).toBe(true);
  });
});
