import type { ColumnDefinition, TableSchema } from '../types';
import { resolveReferencedTable } from './foreignKeyLookup';

export const ERD_NODE_WIDTH = 260;
export const ERD_HEADER_HEIGHT = 40;
export const ERD_ROW_HEIGHT = 22;
export const ERD_FOOTER_HEIGHT = 36;
export const ERD_OVERFLOW_ROW_HEIGHT = 20;
export const ERD_MAX_VISIBLE_COLUMNS = 16;
export const ERD_PADDING = 40;

export type ErdPoint = { x: number; y: number };

export type ErdNode = {
  id: string;
  table: TableSchema;
  x: number;
  y: number;
  width: number;
  height: number;
  visibleColumns: ColumnDefinition[];
  overflowCount: number;
};

export type ErdBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type ErdSpacing = {
  rankGap: number;
  nodeGap: number;
};

export function spacingForTableCount(n: number): ErdSpacing {
  if (n <= 6) return { rankGap: 120, nodeGap: 72 };
  if (n <= 16) return { rankGap: 88, nodeGap: 48 };
  return { rankGap: 64, nodeGap: 32 };
}

function isKeyColumn(column: ColumnDefinition): boolean {
  return Boolean(column.isPrimary || column.foreignKey);
}

export function visibleColumns(
  table: TableSchema,
  cap = ERD_MAX_VISIBLE_COLUMNS
): { columns: ColumnDefinition[]; overflowCount: number } {
  const columns = table.columns;
  const required = columns.filter(isKeyColumn);
  if (required.length >= cap) {
    const seen = new Set(required.map((c) => c.name));
    const rest = columns.filter((c) => !seen.has(c.name));
    return { columns: required, overflowCount: rest.length };
  }
  if (columns.length <= cap) {
    return { columns: [...columns], overflowCount: 0 };
  }
  const must = new Set(required.map((c) => c.name));
  let remainingRequired = required.length;
  const picked: ColumnDefinition[] = [];
  for (const column of columns) {
    const isKey = must.has(column.name);
    if (isKey) {
      picked.push(column);
      remainingRequired--;
    } else if (cap - picked.length > remainingRequired) {
      picked.push(column);
    }
    if (picked.length >= cap) break;
  }
  return { columns: picked, overflowCount: columns.length - picked.length };
}

export function nodeHeight(visibleCount: number, hasOverflow: boolean): number {
  return (
    ERD_HEADER_HEIGHT +
    visibleCount * ERD_ROW_HEIGHT +
    (hasOverflow ? ERD_OVERFLOW_ROW_HEIGHT : 0) +
    ERD_FOOTER_HEIGHT
  );
}

function buildFkTargets(tables: TableSchema[]): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  for (const table of tables) {
    const ids: string[] = [];
    for (const column of table.columns) {
      if (!column.foreignKey) continue;
      const target = resolveReferencedTable(tables, table, column.foreignKey);
      if (target && target.id !== table.id) ids.push(target.id);
    }
    targets.set(table.id, [...new Set(ids)]);
  }
  return targets;
}

function connectedIds(targets: Map<string, string[]>): Set<string> {
  const connected = new Set<string>();
  for (const [source, dests] of targets) {
    if (dests.length > 0) connected.add(source);
    for (const dest of dests) connected.add(dest);
  }
  return connected;
}

function rankConnected(
  ids: string[],
  targets: Map<string, string[]>,
  inGraph: Set<string>
): Map<string, number> {
  const remaining = new Set(ids);
  const ranks = new Map<string, number>();

  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const id of [...remaining]) {
      const graphTargets = (targets.get(id) ?? []).filter((t) => inGraph.has(t));
      if (graphTargets.some((t) => remaining.has(t))) continue;
      const rank =
        graphTargets.length === 0
          ? 0
          : Math.max(...graphTargets.map((t) => ranks.get(t) ?? 0)) + 1;
      ranks.set(id, rank);
      remaining.delete(id);
      progress = true;
    }
  }

  for (const id of remaining) {
    const ranked = (targets.get(id) ?? []).filter((t) => ranks.has(t));
    ranks.set(id, ranked.length ? Math.max(...ranked.map((t) => ranks.get(t)!)) + 1 : 0);
  }
  return ranks;
}

function childrenOf(targets: Map<string, string[]>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const [source, dests] of targets) {
    for (const dest of dests) {
      const list = children.get(dest) ?? [];
      list.push(source);
      children.set(dest, list);
    }
  }
  return children;
}

function barycenterOrder(
  ranks: Map<string, number>,
  targets: Map<string, string[]>,
  tablesById: Map<string, TableSchema>
): Map<number, string[]> {
  const byRank = new Map<number, string[]>();
  for (const [id, rank] of ranks) {
    const list = byRank.get(rank) ?? [];
    list.push(id);
    byRank.set(rank, list);
  }
  for (const list of byRank.values()) {
    list.sort((a, b) => {
      const na = tablesById.get(a)?.name ?? a;
      const nb = tablesById.get(b)?.name ?? b;
      return na.localeCompare(nb);
    });
  }

  const children = childrenOf(targets);
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);

  const indexOf = (id: string, rank: number): number => {
    const list = byRank.get(rank);
    if (!list) return 0;
    const i = list.indexOf(id);
    return i < 0 ? 0 : i;
  };

  const sortByAvg = (ids: string[], neighborRanks: (id: string) => number[]) => {
    ids.sort((a, b) => {
      const avgs = [
        average(neighborRanks(a)),
        average(neighborRanks(b)),
      ];
      if (avgs[0] !== avgs[1]) return avgs[0] - avgs[1];
      const na = tablesById.get(a)?.name ?? a;
      const nb = tablesById.get(b)?.name ?? b;
      return na.localeCompare(nb);
    });
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const rank of rankKeys) {
      const list = byRank.get(rank)!;
      sortByAvg(list, (id) => {
        const parents = targets.get(id) ?? [];
        const indexes: number[] = [];
        for (const parent of parents) {
          const parentRank = ranks.get(parent);
          if (parentRank === undefined) continue;
          indexes.push(indexOf(parent, parentRank));
        }
        return indexes;
      });
    }
    for (const rank of [...rankKeys].reverse()) {
      const list = byRank.get(rank)!;
      sortByAvg(list, (id) => {
        const kids = children.get(id) ?? [];
        const indexes: number[] = [];
        for (const child of kids) {
          const childRank = ranks.get(child);
          if (childRank === undefined) continue;
          indexes.push(indexOf(child, childRank));
        }
        return indexes;
      });
    }
  }

  return byRank;
}

function average(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stackRank(
  ids: string[],
  nodesById: Map<string, ErdNode>,
  x: number,
  startY: number,
  nodeGap: number
): number {
  let y = startY;
  for (const id of ids) {
    const node = nodesById.get(id)!;
    node.x = x;
    node.y = y;
    y += node.height + nodeGap;
  }
  return y;
}

export function layoutErd(
  tables: TableSchema[],
  customPositions: Record<string, ErdPoint> = {}
): ErdNode[] {
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const targets = buildFkTargets(tables);
  const connected = connectedIds(targets);
  const connectedList = tables.map((t) => t.id).filter((id) => connected.has(id));
  const isolated = tables.filter((t) => !connected.has(t.id));

  const ranks = rankConnected(connectedList, targets, connected);
  const byRank = barycenterOrder(ranks, targets, tablesById);
  const spacing = spacingForTableCount(tables.length);

  const nodesById = new Map<string, ErdNode>();
  for (const table of tables) {
    const vis = visibleColumns(table);
    nodesById.set(table.id, {
      id: table.id,
      table,
      x: 0,
      y: 0,
      width: ERD_NODE_WIDTH,
      height: nodeHeight(vis.columns.length, vis.overflowCount > 0),
      visibleColumns: vis.columns,
      overflowCount: vis.overflowCount,
    });
  }

  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);
  for (const rank of rankKeys) {
    const x = ERD_PADDING + rank * (ERD_NODE_WIDTH + spacing.rankGap);
    stackRank(byRank.get(rank)!, nodesById, x, ERD_PADDING, spacing.nodeGap);
  }

  if (isolated.length > 0) {
    const maxRank = rankKeys.length > 0 ? Math.max(...rankKeys) : -1;
    const gridX = ERD_PADDING + (maxRank + 1) * (ERD_NODE_WIDTH + spacing.rankGap);
    const sorted = [...isolated].sort((a, b) => a.name.localeCompare(b.name));
    let y = ERD_PADDING;
    const colHeightLimit = 720;
    let x = gridX;
    for (const table of sorted) {
      const node = nodesById.get(table.id)!;
      if (y > ERD_PADDING && y + node.height > colHeightLimit) {
        x += ERD_NODE_WIDTH + spacing.rankGap;
        y = ERD_PADDING;
      }
      node.x = x;
      node.y = y;
      y += node.height + spacing.nodeGap;
    }
  }

  for (const node of nodesById.values()) {
    const custom = customPositions[node.id];
    if (custom) {
      node.x = custom.x;
      node.y = custom.y;
    }
  }

  return tables.map((table) => nodesById.get(table.id)!);
}

export function layoutBounds(nodes: ErdNode[], padding = ERD_PADDING): ErdBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: padding * 2, height: padding * 2 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
