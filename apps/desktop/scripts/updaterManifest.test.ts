import { describe, expect, test } from 'bun:test';
import { validateUpdaterManifest } from './updaterManifest';

const url = (arch: string) =>
  `https://github.com/MiguelBizzi/bizzi-db/releases/download/v0.1.8/Bizzi.DB_${arch}.app.tar.gz`;

const good = {
  version: '0.1.8',
  notes: 'See the assets below',
  pub_date: '2026-10-14T12:00:00Z',
  platforms: {
    'darwin-aarch64': { signature: 'dW50cnVzdGVk', url: url('aarch64') },
    'darwin-x86_64': { signature: 'dW50cnVzdGVk', url: url('x64') },
  },
};

describe('validateUpdaterManifest', () => {
  test('accepts a complete manifest for the tagged version', () => {
    expect(validateUpdaterManifest(good, 'v0.1.8')).toEqual([]);
  });

  test('rejects a manifest that is not an object', () => {
    expect(validateUpdaterManifest(null, 'v0.1.8')).not.toEqual([]);
    expect(validateUpdaterManifest('nope', 'v0.1.8')).not.toEqual([]);
  });

  test('rejects a version that does not match the tag', () => {
    const problems = validateUpdaterManifest({ ...good, version: '0.1.7' }, 'v0.1.8');
    expect(problems.join(' ')).toContain('0.1.7');
  });

  test('requires both macOS architectures', () => {
    const { 'darwin-x86_64': _dropped, ...onlyArm } = good.platforms;
    const problems = validateUpdaterManifest(
      { ...good, platforms: onlyArm },
      'v0.1.8',
    );
    expect(problems.join(' ')).toContain('darwin-x86_64');
  });

  test('rejects an empty signature', () => {
    const problems = validateUpdaterManifest(
      {
        ...good,
        platforms: {
          ...good.platforms,
          'darwin-aarch64': { signature: ' ', url: url('aarch64') },
        },
      },
      'v0.1.8',
    );
    expect(problems.join(' ')).toContain('darwin-aarch64');
    expect(problems.join(' ')).toContain('signature');
  });

  test('requires an https download url', () => {
    const problems = validateUpdaterManifest(
      {
        ...good,
        platforms: {
          ...good.platforms,
          'darwin-x86_64': { signature: 'abc', url: 'http://example.com/a.tar.gz' },
        },
      },
      'v0.1.8',
    );
    expect(problems.join(' ')).toContain('https');
  });
});
