import { describe, expect, test } from 'bun:test';
import type { IndexDefinition, TableSchema } from '../types';
import { describeIndex, formatIndexSize, indexInsights } from './indexInsights';

function index(name: string, columns: string[], overrides: Partial<IndexDefinition> = {}): IndexDefinition {
  return {
    name,
    columns,
    isUnique: false,
    type: 'BTREE',
    keys: columns.map((expression) => ({ expression, isExpression: false, descending: false })),
    isValid: true,
    scans: 10,
    ...overrides,
  };
}

function table(indexes: IndexDefinition[]): TableSchema {
  return {
    id: 's.t',
    name: 't',
    schema: 's',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: [],
    indexes,
    createdAt: '',
    updatedAt: '',
  };
}

describe('indexInsights', () => {
  test('flags a non-unique index covered by a longer one', () => {
    const insights = indexInsights(table([index('a', ['user_id']), index('ab', ['user_id', 'status'])]));
    expect(insights.get('a')?.map((i) => i.kind)).toEqual(['redundant']);
    expect(insights.get('a')?.[0].message).toContain('"ab"');
    expect(insights.has('ab')).toBe(false);
  });

  test('does not flag unique indexes, other methods, predicates or different order', () => {
    const insights = indexInsights(
      table([
        index('u', ['user_id'], { isUnique: true }),
        index('h', ['user_id'], { type: 'HASH' }),
        index('p', ['user_id'], { predicate: 'active' }),
        index('d', ['user_id'], {
          keys: [{ expression: 'user_id', isExpression: false, descending: true }],
        }),
        index('ab', ['user_id', 'status']),
      ])
    );
    expect(insights.has('u')).toBe(false);
    expect(insights.has('h')).toBe(false);
    expect(insights.has('p')).toBe(false);
    expect(insights.has('d')).toBe(false);
  });

  test('flags only one of two identical indexes', () => {
    const insights = indexInsights(table([index('x1', ['a']), index('x2', ['a'])]));
    expect(insights.has('x1')).toBe(false);
    expect(insights.get('x2')?.[0].kind).toBe('redundant');
  });

  test('flags unused and invalid indexes, never constraint indexes', () => {
    const insights = indexInsights(
      table([
        index('cold', ['a'], { scans: 0, sizeBytes: 2048 }),
        index('broken', ['b'], { isValid: false, scans: 0 }),
        index('pkey', ['id'], { scans: 0, isPrimary: true, isUnique: true }),
      ])
    );
    expect(insights.get('cold')?.[0].message).toContain('2 kB');
    expect(insights.get('broken')?.map((i) => i.kind)).toEqual(['invalid']);
    expect(insights.has('pkey')).toBe(false);
  });
});

describe('describeIndex', () => {
  test('says what the index is for', () => {
    expect(
      describeIndex(
        index('i', ['user_id'], { predicate: 'active', includeColumns: ['total'] })
      )
    ).toBe('Speeds up lookups on user_id for rows where active; also stores total so queries can skip the table.');
    expect(
      describeIndex(index('p', ['id'], { isUnique: true, constraint: { name: 'p', kind: 'primary' } }))
    ).toBe('Enforces the primary key on id.');
    expect(
      describeIndex(
        index('e', [], { keys: [{ expression: 'lower(email)', isExpression: true, descending: false }], isUnique: true })
      )
    ).toBe('Enforces uniqueness on (lower(email)).');
  });
});

describe('formatIndexSize', () => {
  test('formats bytes', () => {
    expect(formatIndexSize(512)).toBe('512 B');
    expect(formatIndexSize(16384)).toBe('16 kB');
    expect(formatIndexSize(1536)).toBe('1.5 kB');
  });
});
