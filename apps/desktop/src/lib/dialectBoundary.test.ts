import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dir, '..');

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'ddl') continue;
      found.push(...files(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      found.push(path);
    }
  }
  return found;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ENGINE_COMPARE =
  /(?:===|!==)\s*['"](?:PostgreSQL|MySQL|SQLServer)['"]|['"](?:PostgreSQL|MySQL|SQLServer)['"]\s*(?:===|!==)/;

describe('dialect boundary', () => {
  test('shared UI does not import the PostgreSQL module', () => {
    const offenders: string[] = [];
    for (const path of files(root)) {
      const text = readFileSync(path, 'utf8');
      if (
        text.includes('DIALECTS.PostgreSQL') ||
        text.includes('ddl/postgres') ||
        text.includes("objectDdlFor('PostgreSQL')") ||
        text.includes('objectDdlFor("PostgreSQL")')
      ) {
        offenders.push(relative(root, path));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('shared code does not default to PostgreSQL or branch on an engine name', () => {
    const offenders: string[] = [];
    for (const path of files(root)) {
      const text = readFileSync(path, 'utf8');
      if (/=\s*['"]PostgreSQL['"]/.test(text) || ENGINE_COMPARE.test(text)) {
        offenders.push(relative(root, path));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('shared code does not emit engine SQL literals', () => {
    const offenders: string[] = [];
    for (const path of files(root)) {
      const code = stripComments(readFileSync(path, 'utf8'));
      const rel = relative(root, path);
      if (code.includes('BEGIN;') || code.includes('COMMIT;')) offenders.push(rel);
      if (!rel.endsWith('sqlContext.ts') && /\bLIMIT\s/.test(code)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
