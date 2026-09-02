import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  ERD_MAX_VISIBLE_COLUMNS,
  ERD_NODE_WIDTH,
  layoutBounds,
  layoutErd,
  nodeHeight,
  spacingForTableCount,
  visibleColumns,
} from './erdLayout';

function column(
  name: string,
  extras: Partial<ColumnDefinition> = {}
): ColumnDefinition {
  return { name, type: 'text', ...extras };
}

function table(name: string, extras: Partial<TableSchema> = {}): TableSchema {
  return {
    id: extras.id ?? `public.${name}`,
    name,
    schema: extras.schema ?? 'public',
    rowCount: 0,
    sizeMb: 0,
    tags: [],
    columns: extras.columns ?? [column('id', { isPrimary: true })],
    indexes: [],
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

describe('spacingForTableCount', () => {
  test('uses wider gaps for small schemas and tighter gaps for large ones', () => {
    const small = spacingForTableCount(3);
    const medium = spacingForTableCount(10);
    const large = spacingForTableCount(40);
    expect(small.rankGap).toBeGreaterThan(medium.rankGap);
    expect(medium.rankGap).toBeGreaterThan(large.rankGap);
    expect(small.nodeGap).toBeGreaterThan(large.nodeGap);
  });
});

describe('visibleColumns', () => {
  test('returns every column when under the cap', () => {
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('email'),
        column('name'),
      ],
    });
    const result = visibleColumns(users);
    expect(result.columns.map((c) => c.name)).toEqual(['id', 'email', 'name']);
    expect(result.overflowCount).toBe(0);
  });

  test('always keeps PK and FK columns when truncating', () => {
    const columns = [
      column('id', { isPrimary: true }),
      ...Array.from({ length: 20 }, (_, i) => column(`c${i}`)),
      column('org_id', {
        foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
      }),
    ];
    const result = visibleColumns(table('users', { columns }));
    expect(result.columns.some((c) => c.name === 'id' && c.isPrimary)).toBe(true);
    expect(result.columns.some((c) => c.name === 'org_id')).toBe(true);
    expect(result.columns.length).toBeLessThanOrEqual(ERD_MAX_VISIBLE_COLUMNS);
    expect(result.overflowCount).toBe(columns.length - result.columns.length);
    expect(result.overflowCount).toBeGreaterThan(0);
  });

  test('includes every PK/FK even if that exceeds the cap', () => {
    const columns = [
      column('id', { isPrimary: true }),
      ...Array.from({ length: ERD_MAX_VISIBLE_COLUMNS }, (_, i) =>
        column(`fk_${i}`, {
          foreignKey: { targetTable: 't', targetColumn: 'id' },
        })
      ),
    ];
    const result = visibleColumns(table('wide', { columns }));
    expect(result.columns.length).toBe(columns.length);
    expect(result.overflowCount).toBe(0);
  });
});

describe('nodeHeight', () => {
  test('grows with visible column count and overflow row', () => {
    expect(nodeHeight(3, false)).toBeGreaterThan(nodeHeight(1, false));
    expect(nodeHeight(3, true)).toBeGreaterThan(nodeHeight(3, false));
  });
});

describe('layoutErd', () => {
  test('places referenced parents to the left of dependents', () => {
    const orgs = table('organizations');
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('org_id', {
          foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
        }),
      ],
    });
    const nodes = layoutErd([users, orgs]);
    const orgNode = nodes.find((n) => n.id === orgs.id)!;
    const userNode = nodes.find((n) => n.id === users.id)!;
    expect(orgNode.x).toBeLessThan(userNode.x);
  });

  test('packs isolated tables away from the FK chain', () => {
    const orgs = table('organizations');
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('org_id', {
          foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
        }),
      ],
    });
    const logs = table('audit_logs');
    const nodes = layoutErd([logs, users, orgs]);
    const logNode = nodes.find((n) => n.id === logs.id)!;
    const orgNode = nodes.find((n) => n.id === orgs.id)!;
    const userNode = nodes.find((n) => n.id === users.id)!;
    expect(logNode.x).toBeGreaterThanOrEqual(userNode.x);
    expect(orgNode.x).toBeLessThan(userNode.x);
  });

  test('resolves FKs by schema, not name alone', () => {
    const billingUsers = table('users', {
      id: 'billing.users',
      schema: 'billing',
    });
    const publicUsers = table('users');
    const orders = table('orders', {
      schema: 'billing',
      id: 'billing.orders',
      columns: [
        column('id', { isPrimary: true }),
        column('user_id', {
          foreignKey: {
            targetTable: 'users',
            targetColumn: 'id',
            targetSchema: 'public',
          },
        }),
      ],
    });
    const nodes = layoutErd([billingUsers, publicUsers, orders]);
    const publicNode = nodes.find((n) => n.id === publicUsers.id)!;
    const orderNode = nodes.find((n) => n.id === orders.id)!;
    expect(publicNode.x).toBeLessThan(orderNode.x);
  });

  test('does not hang on cyclic FKs', () => {
    const a = table('a', {
      columns: [
        column('id', { isPrimary: true }),
        column('b_id', { foreignKey: { targetTable: 'b', targetColumn: 'id' } }),
      ],
    });
    const b = table('b', {
      columns: [
        column('id', { isPrimary: true }),
        column('a_id', { foreignKey: { targetTable: 'a', targetColumn: 'id' } }),
      ],
    });
    const nodes = layoutErd([a, b]);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map((n) => n.id))).toEqual(new Set([a.id, b.id]));
  });

  test('keeps computed size when merging custom positions', () => {
    const users = table('users', {
      columns: [column('id', { isPrimary: true }), column('email')],
    });
    const auto = layoutErd([users])[0];
    const custom = layoutErd([users], { [users.id]: { x: 400, y: 250 } })[0];
    expect(custom.x).toBe(400);
    expect(custom.y).toBe(250);
    expect(custom.width).toBe(auto.width);
    expect(custom.height).toBe(auto.height);
    expect(custom.width).toBe(ERD_NODE_WIDTH);
  });

  test('sizes height from visible columns', () => {
    const short = table('short');
    const tall = table('tall', {
      columns: [
        column('id', { isPrimary: true }),
        column('a'),
        column('b'),
        column('c'),
      ],
    });
    const nodes = layoutErd([short, tall]);
    expect(nodes.find((n) => n.id === tall.id)!.height).toBeGreaterThan(
      nodes.find((n) => n.id === short.id)!.height
    );
  });
});

describe('layoutBounds', () => {
  test('covers every node with padding so SVG can size to the graph', () => {
    const nodes = layoutErd([
      table('organizations'),
      table('users', {
        columns: [
          column('id', { isPrimary: true }),
          column('org_id', {
            foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
          }),
        ],
      }),
    ]);
    const bounds = layoutBounds(nodes);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(node.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(node.x + node.width).toBeLessThanOrEqual(bounds.minX + bounds.width);
      expect(node.y + node.height).toBeLessThanOrEqual(bounds.minY + bounds.height);
    }
    expect(bounds.width).toBeGreaterThan(ERD_NODE_WIDTH);
    expect(bounds.height).toBeGreaterThan(0);
  });

  test('includes dragged nodes outside the auto layout', () => {
    const users = table('users');
    const nodes = layoutErd([users], { [users.id]: { x: 2000, y: 1800 } });
    const bounds = layoutBounds(nodes);
    expect(bounds.minX + bounds.width).toBeGreaterThan(2000 + ERD_NODE_WIDTH);
    expect(bounds.minY + bounds.height).toBeGreaterThan(1800);
  });

  test('returns a padded empty box when there are no tables', () => {
    const bounds = layoutBounds([]);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });
});
