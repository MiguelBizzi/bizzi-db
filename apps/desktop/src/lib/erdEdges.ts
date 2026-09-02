import type { ErdNode, ErdPoint } from './erdLayout';
import {
  ERD_HEADER_HEIGHT,
  ERD_OVERFLOW_ROW_HEIGHT,
  ERD_ROW_HEIGHT,
} from './erdLayout';
import { resolveReferencedTable } from './foreignKeyLookup';

export type ErdEdge = {
  id: string;
  sourceTableId: string;
  sourceColumn: string;
  targetTableId: string;
  targetColumn: string;
  path: string;
  source: ErdPoint;
  target: ErdPoint;
};

export function columnPortY(columnIndex: number, overflowPort: boolean): number {
  if (overflowPort) {
    return (
      ERD_HEADER_HEIGHT +
      columnIndex * ERD_ROW_HEIGHT +
      ERD_OVERFLOW_ROW_HEIGHT / 2
    );
  }
  return ERD_HEADER_HEIGHT + columnIndex * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2;
}

export function edgePath(source: ErdPoint, target: ErdPoint): string {
  const dx = Math.max(40, Math.abs(target.x - source.x) / 2);
  const goingRight = target.x >= source.x;
  const c1x = source.x + (goingRight ? dx : -dx);
  const c2x = target.x + (goingRight ? -dx : dx);
  return `M ${source.x} ${source.y} C ${c1x} ${source.y}, ${c2x} ${target.y}, ${target.x} ${target.y}`;
}

function portYForColumn(node: ErdNode, columnName: string): number {
  const index = node.visibleColumns.findIndex((c) => c.name === columnName);
  if (index >= 0) {
    return node.y + columnPortY(index, false);
  }
  return node.y + columnPortY(node.visibleColumns.length, true);
}

export function buildErdEdges(nodes: ErdNode[]): ErdEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const tables = nodes.map((node) => node.table);
  const edges: ErdEdge[] = [];

  for (const node of nodes) {
    for (const column of node.table.columns) {
      if (!column.foreignKey) continue;
      const targetTable = resolveReferencedTable(tables, node.table, column.foreignKey);
      if (!targetTable || targetTable.id === node.id) continue;
      const targetNode = byId.get(targetTable.id);
      if (!targetNode) continue;

      const targetOnRight = targetNode.x >= node.x + node.width / 2;
      const source: ErdPoint = {
        x: targetOnRight ? node.x + node.width : node.x,
        y: portYForColumn(node, column.name),
      };
      const target: ErdPoint = {
        x: targetOnRight ? targetNode.x : targetNode.x + targetNode.width,
        y: portYForColumn(targetNode, column.foreignKey.targetColumn),
      };

      edges.push({
        id: `${node.id}.${column.name}->${targetTable.id}.${column.foreignKey.targetColumn}`,
        sourceTableId: node.id,
        sourceColumn: column.name,
        targetTableId: targetTable.id,
        targetColumn: column.foreignKey.targetColumn,
        source,
        target,
        path: edgePath(source, target),
      });
    }
  }

  return edges;
}
