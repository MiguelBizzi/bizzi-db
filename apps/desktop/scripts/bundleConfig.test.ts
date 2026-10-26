import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dir, '../src-tauri');

function config(name: string): Record<string, unknown> {
  const file = path.join(dir, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

// The executable name is what Activity Monitor, the Dock and `ps` show; without
// mainBinaryName it is the Cargo package name, db-desktop.
describe('executable name', () => {
  test('macOS shows the product name', () => {
    expect(config('tauri.macos.conf.json').mainBinaryName).toBe(config('tauri.conf.json').productName);
  });

  test('Linux uses the package name', () => {
    expect(config('tauri.linux.conf.json').mainBinaryName).toBe('bizzi-db');
  });
});
