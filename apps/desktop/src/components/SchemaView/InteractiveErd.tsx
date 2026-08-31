import React, { useState } from 'react';
import { DatabaseSchema, TableSchema } from '../../types';
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Key,
  Link,
  Layers,
  Search,
  Download,
  Table as TableIcon,
  Sparkles,
  Move,
  RotateCcw,
} from 'lucide-react';

interface InteractiveErdProps {
  database: DatabaseSchema;
  onSelectTableData: (table: TableSchema) => void;
  onSelectTableSchema: (table: TableSchema) => void;
}

export const InteractiveErd: React.FC<InteractiveErdProps> = ({
  database,
  onSelectTableData,
  onSelectTableSchema,
}) => {
  const [zoom, setZoom] = useState(1);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [customPositions, setCustomPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [draggingTable, setDraggingTable] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Auto layout table nodes in a grid
  const nodeWidth = 240;
  const nodeHeight = 220;
  const columnsCount = 3;

  const tablePositions = database.tables.map((table, index) => {
    const row = Math.floor(index / columnsCount);
    const col = index % columnsCount;
    const defaultX = col * (nodeWidth + 80) + 40;
    const defaultY = row * (nodeHeight + 60) + 40;
    const pos = customPositions[table.id] || { x: defaultX, y: defaultY };
    return {
      table,
      x: pos.x,
      y: pos.y,
    };
  });

  const handlePointerDown = (
    e: React.PointerEvent,
    tableId: string,
    currentX: number,
    currentY: number
  ) => {
    if (e.button !== 0) return;
    setDraggingTable({
      id: tableId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingTable) return;
    const dx = (e.clientX - draggingTable.startX) / zoom;
    const dy = (e.clientY - draggingTable.startY) / zoom;
    setCustomPositions((prev) => ({
      ...prev,
      [draggingTable.id]: {
        x: Math.max(10, draggingTable.initialX + dx),
        y: Math.max(10, draggingTable.initialY + dy),
      },
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingTable) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore pointer capture release error
      }
      setDraggingTable(null);
    }
  };

  // Calculate Foreign Key relationships for SVG connecting paths
  const relationships: {
    sourceTable: string;
    sourceCol: string;
    targetTable: string;
    targetCol: string;
    sourcePos: { x: number; y: number };
    targetPos: { x: number; y: number };
  }[] = [];

  tablePositions.forEach((pos) => {
    pos.table.columns.forEach((col) => {
      if (col.foreignKey) {
        const targetPos = tablePositions.find(
          (tp) => tp.table.name === col.foreignKey?.targetTable
        );
        if (targetPos) {
          relationships.push({
            sourceTable: pos.table.name,
            sourceCol: col.name,
            targetTable: targetPos.table.name,
            targetCol: col.foreignKey.targetColumn,
            sourcePos: { x: pos.x + nodeWidth, y: pos.y + 80 },
            targetPos: { x: targetPos.x, y: targetPos.y + 80 },
          });
        }
      }
    });
  });

  const filteredPositions = tablePositions.filter((tp) =>
    tp.table.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      {/* Top Controls Bar */}
      <div className="p-3 bg-card border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Network className="w-4 h-4 text-primary" />
            <span>Interactive Entity Relationship Diagram (ERD)</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
            {database.tables.length} Tables • {relationships.length} Relationships
          </span>
          <span className="hidden sm:inline text-[10px] text-muted-foreground font-sans italic">
            Drag table headers to reposition
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Reset Layout */}
          {Object.keys(customPositions).length > 0 && (
            <button
              onClick={() => setCustomPositions({})}
              title="Reset Table Positions"
              className="flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-accent text-foreground text-xs transition-colors border border-border"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Reset Layout</span>
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find table in diagram..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-background border border-border rounded-lg text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-44"
            />
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
            <button
              onClick={() => setZoom(Math.max(0.6, zoom - 0.1))}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] w-12 text-center font-mono">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ERD Canvas Area */}
      <div className="flex-1 overflow-auto p-8 relative scrollbar-thin scrollbar-thumb-muted bg-background">
        <div
          className="relative transition-transform duration-75 origin-top-left min-w-[1400px] min-h-[900px]"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* SVG Relationship Connecting Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
              </marker>
            </defs>

            {relationships.map((rel, i) => {
              const isHighlighted =
                hoveredTable === rel.sourceTable ||
                hoveredTable === rel.targetTable;

              // Cubic Bezier curve path
              const dx = Math.abs(rel.targetPos.x - rel.sourcePos.x) / 2;
              const pathStr = `M ${rel.sourcePos.x} ${rel.sourcePos.y} C ${
                rel.sourcePos.x + dx
              } ${rel.sourcePos.y}, ${rel.targetPos.x - dx} ${
                rel.targetPos.y
              }, ${rel.targetPos.x} ${rel.targetPos.y}`;

              return (
                <g key={i}>
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={isHighlighted ? '#818cf8' : '#334155'}
                    strokeWidth={isHighlighted ? 3 : 1.5}
                    strokeDasharray={isHighlighted ? undefined : '4 4'}
                    markerEnd="url(#arrow)"
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}
          </svg>

          {/* Table Cards */}
          {filteredPositions.map(({ table, x, y }) => {
            const isHovered = hoveredTable === table.name;
            const isDraggingThis = draggingTable?.id === table.id;

            return (
              <div
                key={table.id}
                onMouseEnter={() => setHoveredTable(table.name)}
                onMouseLeave={() => setHoveredTable(null)}
                style={{ left: x, top: y, width: nodeWidth }}
                className={`absolute rounded-xl border shadow-xl bg-card overflow-hidden z-10 transition-shadow duration-150 ${
                  isDraggingThis
                    ? 'border-purple-500 shadow-purple-950/60 ring-2 ring-purple-500/50 z-30 cursor-grabbing'
                    : isHovered
                    ? 'border-primary shadow-primary/20 ring-2 ring-primary/30 z-20'
                    : 'border-border'
                }`}
              >
                {/* Table Node Header - Draggable Target */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, table.id, x, y)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="p-2.5 bg-background border-b border-border flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-accent/80 transition-colors touch-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Move className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <TableIcon className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="font-mono text-xs font-bold text-foreground truncate">
                      {table.name}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground">
                    {table.rowCount.toLocaleString()} r
                  </span>
                </div>

                {/* Columns List */}
                <div className="p-2 space-y-1 max-h-48 overflow-y-auto font-mono text-[11px] scrollbar-none">
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="flex items-center justify-between p-1 rounded hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {col.isPrimary ? (
                          <Key className="w-3 h-3 text-amber-400 shrink-0" />
                        ) : col.foreignKey ? (
                          <Link className="w-3 h-3 text-primary shrink-0" />
                        ) : (
                          <div className="w-3 h-3" />
                        )}
                        <span className="truncate text-foreground">
                          {col.name}
                        </span>
                      </div>

                      <span className="text-[10px] text-muted-foreground font-sans">
                        {col.type}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer Buttons */}
                <div className="p-1.5 bg-background/80 border-t border-border flex items-center justify-between text-[10px] font-mono">
                  <button
                    onClick={() => onSelectTableData(table)}
                    className="px-2 py-1 rounded bg-muted hover:bg-accent text-primary transition-colors border border-border"
                  >
                    View Data
                  </button>

                  <button
                    onClick={() => onSelectTableSchema(table)}
                    className="px-2 py-1 rounded bg-muted hover:bg-accent text-purple-400 transition-colors border border-border"
                  >
                    Edit Schema
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
