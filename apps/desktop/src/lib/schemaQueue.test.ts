import { describe, expect, test } from 'bun:test';
import {
  applyAllScripts,
  removeSchemaChange,
  schemaChangeScript,
  stageSchemaChange,
  stagedFromPlan,
  type StagedSchemaChange,
} from './schemaQueue';

function change(overrides: Partial<StagedSchemaChange> = {}): StagedSchemaChange {
  return {
    key: 'index:shop.idx_a',
    objectKind: 'index',
    action: 'drop',
    schema: 'shop',
    name: 'idx_a',
    title: 'Delete index idx_a',
    sql: 'DROP INDEX "shop"."idx_a";',
    transactional: true,
    warnings: [],
    ...overrides,
  };
}

describe('stageSchemaChange', () => {
  test('appends new objects and replaces a change to the same object in place', () => {
    const a = change();
    const b = change({ key: 'routine:shop.f()', name: 'f' });
    const queue = stageSchemaChange(stageSchemaChange([], a), b);
    expect(queue.map((c) => c.key)).toEqual([a.key, b.key]);
    const replaced = stageSchemaChange(queue, change({ action: 'alter', title: 'Rename' }));
    expect(replaced.map((c) => c.key)).toEqual([a.key, b.key]);
    expect(replaced[0].title).toBe('Rename');
  });

  test('removes by key', () => {
    expect(removeSchemaChange([change()], 'index:shop.idx_a')).toEqual([]);
  });
});

describe('schemaChangeScript', () => {
  test('wraps multi-statement transactional changes in a transaction', () => {
    expect(schemaChangeScript(change())).toBe('DROP INDEX "shop"."idx_a";');
    expect(schemaChangeScript(change({ sql: 'DROP INDEX a;\nCREATE INDEX a ON t (x);' }))).toBe(
      'BEGIN;\nDROP INDEX a;\nCREATE INDEX a ON t (x);\nCOMMIT;'
    );
    expect(
      schemaChangeScript(change({ sql: 'CREATE INDEX CONCURRENTLY b ON t (x);\nDROP INDEX CONCURRENTLY a;', transactional: false }))
    ).toBe('CREATE INDEX CONCURRENTLY b ON t (x);\nDROP INDEX CONCURRENTLY a;');
  });
});

describe('applyAllScripts', () => {
  test('runs row changes and transactional schema changes in one transaction, the rest after', () => {
    const scripts = applyAllScripts('UPDATE t SET a = 1 WHERE id = 1;', [
      change(),
      change({ key: 'c', sql: 'CREATE INDEX CONCURRENTLY n ON t (x);', transactional: false }),
      change({ key: 'd', sql: 'ALTER TABLE t DROP COLUMN z;' }),
    ]);
    expect(scripts).toEqual([
      'BEGIN;\nUPDATE t SET a = 1 WHERE id = 1;\nDROP INDEX "shop"."idx_a";\nALTER TABLE t DROP COLUMN z;\nCOMMIT;',
      'CREATE INDEX CONCURRENTLY n ON t (x);',
    ]);
  });

  test('is empty when nothing is staged', () => {
    expect(applyAllScripts('', [])).toEqual([]);
    expect(applyAllScripts('', [change({ transactional: false })])).toEqual(['DROP INDEX "shop"."idx_a";']);
  });
});

describe('stagedFromPlan', () => {
  test('joins statements without BEGIN/COMMIT and keeps the plan flags', () => {
    const staged = stagedFromPlan(
      { statements: ['DROP INDEX a;', 'CREATE INDEX a ON t (x);'], transactional: true, warnings: ['w'] },
      { key: 'k', objectKind: 'index', action: 'recreate', schema: 's', name: 'a', title: 'Rebuild a' }
    );
    expect(staged.sql).toBe('DROP INDEX a;\nCREATE INDEX a ON t (x);');
    expect(staged.transactional).toBe(true);
    expect(staged.warnings).toEqual(['w']);
  });
});
