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
    expect(schemaChangeScript(change(), 'PostgreSQL')).toBe('DROP INDEX "shop"."idx_a";');
    expect(schemaChangeScript(change({ sql: 'DROP INDEX a;\nCREATE INDEX a ON t (x);' }), 'PostgreSQL')).toBe(
      'BEGIN;\nDROP INDEX a;\nCREATE INDEX a ON t (x);\nCOMMIT;'
    );
    expect(
      schemaChangeScript(change({ sql: 'CREATE INDEX CONCURRENTLY b ON t (x);\nDROP INDEX CONCURRENTLY a;', transactional: false }), 'PostgreSQL')
    ).toBe('CREATE INDEX CONCURRENTLY b ON t (x);\nDROP INDEX CONCURRENTLY a;');
  });

  test('wraps SQL Server batches separated by GO', () => {
    const sql = 'CREATE OR ALTER VIEW [dbo].[v] AS\nSELECT 1\nGO\nCREATE OR ALTER VIEW [dbo].[w] AS\nSELECT 2';
    expect(schemaChangeScript(change({ sql }), 'SQLServer')).toBe(
      `SET XACT_ABORT ON;\nBEGIN TRANSACTION;\nGO\n${sql}\nGO\nCOMMIT TRANSACTION;`,
    );
  });
});

describe('applyAllScripts', () => {
  test('runs row changes and transactional schema changes in one transaction, the rest after', () => {
    const scripts = applyAllScripts('UPDATE t SET a = 1 WHERE id = 1;', [
      change(),
      change({ key: 'c', sql: 'CREATE INDEX CONCURRENTLY n ON t (x);', transactional: false }),
      change({ key: 'd', sql: 'ALTER TABLE t DROP COLUMN z;' }),
    ], { dialect: 'PostgreSQL' });
    expect(scripts).toEqual([
      'BEGIN;\nUPDATE t SET a = 1 WHERE id = 1;\nDROP INDEX "shop"."idx_a";\nALTER TABLE t DROP COLUMN z;\nCOMMIT;',
      'CREATE INDEX CONCURRENTLY n ON t (x);',
    ]);
  });

  test('keeps DDL outside the transaction when the engine commits DDL implicitly', () => {
    const scripts = applyAllScripts(
      'UPDATE t SET a = 1 WHERE id = 1;',
      [change({ sql: 'ALTER TABLE t ADD COLUMN z int;' })],
      { transactionalDdl: false, dialect: 'PostgreSQL' },
    );
    expect(scripts).toEqual([
      'BEGIN;\nUPDATE t SET a = 1 WHERE id = 1;\nCOMMIT;',
      'ALTER TABLE t ADD COLUMN z int;',
    ]);
  });

  test('is empty when nothing is staged', () => {
    expect(applyAllScripts('', [], { dialect: 'PostgreSQL' })).toEqual([]);
    expect(applyAllScripts('', [change({ transactional: false })], { dialect: 'PostgreSQL' })).toEqual(['DROP INDEX "shop"."idx_a";']);
  });

  test('keeps each SQL Server batch first in its own batch inside the transaction', () => {
    const procedure = 'CREATE OR ALTER PROCEDURE [dbo].[p]\nAS\nBEGIN\nSELECT 1\nEND';
    const scripts = applyAllScripts('INSERT INTO [dbo].[t] ([id]) VALUES (1);', [change({ sql: procedure })], {
      dialect: 'SQLServer',
    });
    expect(scripts).toEqual([
      `SET XACT_ABORT ON;\nBEGIN TRANSACTION;\nGO\nINSERT INTO [dbo].[t] ([id]) VALUES (1);\nGO\n${procedure}\nGO\nCOMMIT TRANSACTION;`,
    ]);
  });
});

describe('stagedFromPlan', () => {
  test('joins statements without BEGIN/COMMIT and keeps the plan flags', () => {
    const staged = stagedFromPlan(
      { statements: ['DROP INDEX a;', 'CREATE INDEX a ON t (x);'], transactional: true, warnings: ['w'] },
      { key: 'k', objectKind: 'index', action: 'recreate', schema: 's', name: 'a', title: 'Rebuild a' },
      'PostgreSQL',
    );
    expect(staged.sql).toBe('DROP INDEX a;\nCREATE INDEX a ON t (x);');
    expect(staged.transactional).toBe(true);
    expect(staged.warnings).toEqual(['w']);
  });

  test('separates SQL Server statements with GO so a module stays first in its batch', () => {
    const rename = "EXEC sp_rename N'[dbo].[a]', N'b', N'OBJECT';";
    const create = 'CREATE OR ALTER PROCEDURE [dbo].[b]\nAS\nBEGIN\nSELECT 1\nEND';
    const staged = stagedFromPlan(
      { statements: [rename, create], transactional: true, warnings: [] },
      { key: 'k', objectKind: 'procedure', action: 'alter', schema: 'dbo', name: 'b', title: 'Edit b' },
      'SQLServer',
    );
    expect(staged.sql).toBe(`${rename}\nGO\n${create}`);
  });
});
