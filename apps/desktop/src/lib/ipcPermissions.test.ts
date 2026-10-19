import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tauri rejects any command the capability's permission set doesn't allow
// ("<command> not allowed. Command not found"), so every registered command
// must also be listed in permissions/app.toml.
const TAURI = join(import.meta.dir, '..', '..', 'src-tauri');
const libRs = readFileSync(join(TAURI, 'src', 'lib.rs'), 'utf8');
const appToml = readFileSync(join(TAURI, 'permissions', 'app.toml'), 'utf8');

function registeredCommands(): string[] {
  const handler = libRs.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!handler) throw new Error('generate_handler! not found in lib.rs');
  return handler[1]
    .split(',')
    .map((entry) => entry.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean);
}

function allowedCommands(): string[] {
  const allow = appToml.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/);
  if (!allow) throw new Error('commands.allow not found in app.toml');
  return [...allow[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('IPC command permissions', () => {
  test('every registered command is allowed', () => {
    const allowed = new Set(allowedCommands());
    expect(registeredCommands().filter((command) => !allowed.has(command))).toEqual([]);
  });

  test('every allowed command is registered', () => {
    const registered = new Set(registeredCommands());
    expect(allowedCommands().filter((command) => !registered.has(command))).toEqual([]);
  });
});
