import { describe, expect, test } from 'bun:test';
import type { IndexDefinition, TableSchema } from '../../../types';
import { buildCreateIndexSql, planCreateIndex, planIndexChange } from './indexDdl';
import { emptyKeyDraft, type IndexContext, type IndexDraft } from '../types';

const table: TableSchema = {
  id: 'orders',
  schema: 'sales',
  name: 'orders',
  rowCount: 0,
  sizeMb: 0,
  tags: [],
  createdAt: '',
  updatedAt: '',
  columns: [],
  indexes: [],
};

function draft(overrides: Partial<IndexDraft> = {}): IndexDraft {
  return {
    name: 'orders_status',
    method: 'nonclustered',
    unique: false,
    keys: [{ ...emptyKeyDraft('status'), descending: true }],
    include: ['total'],
    predicate: 'status IS NOT NULL',
    nullsNotDistinct: false,
    storageParams: [{ name: 'fillfactor', value: '80' }],
    tablespace: '',
    concurrently: true,
    ifNotExists: false,
    invisible: false,
    comment: '',
    ...overrides,
  };
}

describe('sqlserver index ddl', () => {
  test('builds a filtered included nonclustered index', () => {
    const sql = buildCreateIndexSql(table, draft());
    expect(sql).toBe(
      'CREATE NONCLUSTERED INDEX [orders_status] ON [sales].[orders] ([status] DESC) INCLUDE ([total]) WHERE status IS NOT NULL WITH (FILLFACTOR = 80, ONLINE = ON);',
    );
  });

  test('builds a clustered columnstore index without keys', () => {
    const sql = buildCreateIndexSql(
      table,
      draft({ name: 'orders_cs', method: 'clustered columnstore', keys: [], include: [], predicate: '', storageParams: [], concurrently: false }),
    );
    expect(sql).toBe('CREATE CLUSTERED COLUMNSTORE INDEX [orders_cs] ON [sales].[orders];');
  });

  test('plans the create inside a transaction', () => {
    const plan = planCreateIndex(table, draft({ concurrently: false, storageParams: [] }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.transactional).toBe(true);
  });

  test('keeps an online build out of a transaction', () => {
    const plan = planCreateIndex(table, draft());
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.transactional).toBe(false);
  });

  test('renames in place when the index shape is unchanged', () => {
    const plan = planIndexChange(existing(), draft({ name: 'orders_status_2', concurrently: false }), context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.mode).toBe('alter');
    expect(plan.statements).toEqual([
      "EXEC sp_rename N'[sales].[orders].[orders_status]', N'orders_status_2', N'INDEX';",
    ]);
  });

  test('drops the current name before creating a renamed index with a new key', () => {
    const plan = planIndexChange(
      existing(),
      draft({
        name: 'orders_status_2',
        concurrently: false,
        keys: [{ ...emptyKeyDraft('id'), descending: false }],
      }),
      context,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.statements[0]).toBe('DROP INDEX [orders_status] ON [sales].[orders];');
    expect(plan.statements[1]).toContain('INDEX [orders_status_2]');
    expect(plan.statements.join('\n')).not.toContain('sp_rename');
  });

  test('rebuilds when only the INCLUDE list changes', () => {
    const plan = planIndexChange(existing(), draft({ concurrently: false, include: ['id'] }), context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.mode).toBe('recreate');
    expect(plan.statements[0]).toBe('DROP INDEX [orders_status] ON [sales].[orders];');
    expect(plan.statements[1]).toContain('INCLUDE ([id])');
  });

  test('rebuilds when only a storage option changes', () => {
    const plan = planIndexChange(
      existing(),
      draft({ concurrently: false, storageParams: [{ name: 'fillfactor', value: '70' }] }),
      context,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.mode).toBe('recreate');
  });
});

function existing(): IndexDefinition {
  return {
    name: 'orders_status',
    columns: ['status'],
    isUnique: false,
    type: 'nonclustered',
    keys: [{ expression: 'status', isExpression: false, descending: true }],
    includeColumns: ['total'],
    predicate: 'status IS NOT NULL',
    storageParams: [{ name: 'fillfactor', value: '80' }],
  };
}

const context: IndexContext = { table, tables: [table] };
