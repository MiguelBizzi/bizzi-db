import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, TableSchema } from '../types';
import {
  ERD_HEADER_HEIGHT,
  ERD_NODE_WIDTH,
  ERD_ROW_HEIGHT,
  layoutBounds,
  layoutErd,
} from './erdLayout';
import {
  buildErdEdges,
  columnPortY,
  edgePath,
} from './erdEdges';

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

describe('columnPortY', () => {
  test('anchors at the vertical center of a visible column row', () => {
    expect(columnPortY(0, false)).toBe(ERD_HEADER_HEIGHT + ERD_ROW_HEIGHT / 2);
    expect(columnPortY(2, false)).toBe(
      ERD_HEADER_HEIGHT + 2 * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2
    );
  });
});

describe('edgePath', () => {
  test('emits a cubic bezier between ports', () => {
    const path = edgePath({ x: 260, y: 50 }, { x: 400, y: 80 });
    expect(path.startsWith('M 260 50 C ')).toBe(true);
    expect(path.endsWith('400 80')).toBe(true);
    expect(path).toContain('C ');
  });
});

describe('buildErdEdges', () => {
  test('builds one edge per resolvable FK at column ports', () => {
    const orgs = table('organizations', {
      columns: [column('id', { isPrimary: true }), column('name')],
    });
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('email'),
        column('org_id', {
          foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
        }),
      ],
    });
    const nodes = layoutErd([orgs, users]);
    const edges = buildErdEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceTableId).toBe(users.id);
    expect(edges[0].sourceColumn).toBe('org_id');
    expect(edges[0].targetTableId).toBe(orgs.id);
    expect(edges[0].targetColumn).toBe('id');

    const userNode = nodes.find((n) => n.id === users.id)!;
    const orgNode = nodes.find((n) => n.id === orgs.id)!;
    expect(edges[0].source.y).toBe(userNode.y + columnPortY(2, false));
    expect(edges[0].target.y).toBe(orgNode.y + columnPortY(0, false));
  });

  test('skips FKs whose target table is missing', () => {
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('org_id', {
          foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
        }),
      ],
    });
    expect(buildErdEdges(layoutErd([users]))).toHaveLength(0);
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
    const edges = buildErdEdges(layoutErd([billingUsers, publicUsers, orders]));
    expect(edges).toHaveLength(1);
    expect(edges[0].targetTableId).toBe(publicUsers.id);
  });

  test('exits the right side when the target is to the right', () => {
    const parent = table('parent');
    const child = table('child', {
      columns: [
        column('id', { isPrimary: true }),
        column('parent_id', {
          foreignKey: { targetTable: 'parent', targetColumn: 'id' },
        }),
      ],
    });
    const nodes = layoutErd([parent, child]);
    const edge = buildErdEdges(nodes)[0];
    const childNode = nodes.find((n) => n.id === child.id)!;
    const parentNode = nodes.find((n) => n.id === parent.id)!;
    // parent is left, child is right → child exits left, parent is entered from the right
    expect(parentNode.x).toBeLessThan(childNode.x);
    expect(edge.source.x).toBe(childNode.x);
    expect(edge.target.x).toBe(parentNode.x + ERD_NODE_WIDTH);
  });

  test('keeps every port inside layout bounds so SVG does not clip', () => {
    const orgs = table('organizations');
    const users = table('users', {
      columns: [
        column('id', { isPrimary: true }),
        column('org_id', {
          foreignKey: { targetTable: 'organizations', targetColumn: 'id' },
        }),
      ],
    });
    const nodes = layoutErd(
      [orgs, users],
      { [users.id]: { x: 1800, y: 1400 } }
    );
    const bounds = layoutBounds(nodes);
    const edges = buildErdEdges(nodes);
    expect(edges).toHaveLength(1);
    for (const edge of edges) {
      for (const p of [edge.source, edge.target]) {
        expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
        expect(p.y).toBeGreaterThanOrEqual(bounds.minY);
        expect(p.x).toBeLessThanOrEqual(bounds.minX + bounds.width);
        expect(p.y).toBeLessThanOrEqual(bounds.minY + bounds.height);
      }
    }
  });
});
