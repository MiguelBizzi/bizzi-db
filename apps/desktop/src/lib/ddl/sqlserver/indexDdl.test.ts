import { describe, expect, test } from 'bun:test';
import type { TableSchema } from '../../../types';
import { buildCreateIndexSql, planCreateIndex } from './indexDdl';
import { emptyKeyDraft, type IndexDraft } from '../types';

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
});
