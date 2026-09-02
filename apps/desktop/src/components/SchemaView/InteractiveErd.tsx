import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Key,
  Link,
  Maximize2,
  Move,
  Network,
  RotateCcw,
  Search,
  Table as TableIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DatabaseSchema, TableSchema } from '../../types';
import { shortColumnType } from '../../lib/columnTypeDisplay';
import { knownRowCount } from '../../lib/format';
import { buildErdEdges, type ErdEdge } from '../../lib/erdEdges';
import { downloadDataUrl, erdExportFileName, snapshotErdPng } from '../../lib/erdExport';
import { layoutBounds, layoutErd, type ErdPoint } from '../../lib/erdLayout';
import {
  clearErdPositions,
  readErdPositions,
  writeErdPositions,
} from '../../lib/erdPositions';
import { columnKey, searchErd } from '../../lib/erdSearch';
import {
  ERD_DEFAULT_ZOOM,
  centerOnWorld,
  clampZoom,
  fitBounds,
  panViewport,
  wheelZoomFactor,
  zoomAtPoint,
  type ErdViewport,
} from '../../lib/erdViewport';

interface InteractiveErdProps {
  database: DatabaseSchema;
  onSelectTableData: (table: TableSchema) => void;
  onSelectTableSchema: (table: TableSchema) => void;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function shouldPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-erd-table]')) return false;
  if (target.closest('[data-erd-edge]')) return false;
  return Boolean(target.closest('[data-erd-canvas]'));
}

export const InteractiveErd: React.FC<InteractiveErdProps> = ({
  database,
  onSelectTableData,
  onSelectTableSchema,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const didFit = useRef(false);

  const [customPositions, setCustomPositions] = useState<Record<string, ErdPoint>>(() => {
    const storage = browserStorage();
    return storage ? readErdPositions(storage, database.id) : {};
  });
  const [viewport, setViewport] = useState<ErdViewport>({
    x: 0,
    y: 0,
    zoom: ERD_DEFAULT_ZOOM,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draggingTable, setDraggingTable] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const storage = browserStorage();
    setCustomPositions(storage ? readErdPositions(storage, database.id) : {});
    didFit.current = false;
  }, [database.id]);

  const nodes = useMemo(
    () => layoutErd(database.tables, customPositions),
    [database.tables, customPositions]
  );
  const edges = useMemo(() => buildErdEdges(nodes), [nodes]);
  const bounds = useMemo(() => layoutBounds(nodes), [nodes]);
  const hits = useMemo(
    () => searchErd(database.tables, searchTerm),
    [database.tables, searchTerm]
  );
  const searchTableSet = useMemo(() => new Set(hits.tableIds), [hits.tableIds]);
  const searchColumnSet = useMemo(() => new Set(hits.columnKeys), [hits.columnKeys]);

  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const persistPositions = useCallback(
    (next: Record<string, ErdPoint>) => {
      const storage = browserStorage();
      if (!storage) return;
      if (Object.keys(next).length === 0) clearErdPositions(storage, database.id);
      else writeErdPositions(storage, database.id, next);
    },
    [database.id]
  );

  const measureCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return null;
    return { width: rect.width, height: rect.height };
  }, []);

  useLayoutEffect(() => {
    if (didFit.current || nodes.length === 0) return;
    const size = measureCanvas();
    if (!size) return;
    setViewport(fitBounds(bounds, size));
    didFit.current = true;
  }, [bounds, measureCanvas, nodes.length]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
      const current = viewportRef.current;
      const next = zoomAtPoint(current, current.zoom * factor, point);
      viewportRef.current = next;
      setViewport(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const layoutSnapshot = useRef({ nodes, bounds });
  layoutSnapshot.current = { nodes, bounds };

  const firstHitId = hits.tableIds[0];
  useEffect(() => {
    if (!searchTerm.trim() || !firstHitId) return;
    const { nodes: currentNodes, bounds: currentBounds } = layoutSnapshot.current;
    const node = currentNodes.find((item) => item.id === firstHitId);
    const size = measureCanvas();
    if (!node || !size) return;
    setViewport(
      centerOnWorld(
        viewportRef.current.zoom,
        { x: node.x + node.width / 2, y: node.y + node.height / 2 },
        currentBounds,
        size
      )
    );
  }, [searchTerm, firstHitId, measureCanvas]);

  const zoomTowardCenter = (nextZoom: number) => {
    const size = measureCanvas();
    const point = size
      ? { x: size.width / 2, y: size.height / 2 }
      : { x: 0, y: 0 };
    const next = zoomAtPoint(viewportRef.current, nextZoom, point);
    viewportRef.current = next;
    setViewport(next);
  };

  const handleFit = () => {
    const size = measureCanvas();
    if (!size) return;
    const next = fitBounds(bounds, size);
    viewportRef.current = next;
    setViewport(next);
  };

  const handleResetLayout = () => {
    setCustomPositions({});
    persistPositions({});
    didFit.current = false;
  };

  const handleExport = async () => {
    if (!worldRef.current || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await snapshotErdPng(worldRef.current);
      downloadDataUrl(dataUrl, erdExportFileName(database.name));
    } finally {
      setExporting(false);
    }
  };

  const handleTablePointerDown = (
    event: React.PointerEvent,
    tableId: string,
    currentX: number,
    currentY: number
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setPanning(null);
    setDraggingTable({
      id: tableId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: currentX,
      initialY: currentY,
    });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || draggingTable) return;
    if (!shouldPan(event.target)) return;
    setSelectedEdgeId(null);
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  };

  useEffect(() => {
    if (!draggingTable && !panning) return;

    const onMove = (event: PointerEvent) => {
      if (draggingTable) {
        const dx = (event.clientX - draggingTable.startX) / viewport.zoom;
        const dy = (event.clientY - draggingTable.startY) / viewport.zoom;
        setCustomPositions((prev) => ({
          ...prev,
          [draggingTable.id]: {
            x: draggingTable.initialX + dx,
            y: draggingTable.initialY + dy,
          },
        }));
        return;
      }
      if (panning) {
        setViewport(
          panViewport(
            { x: panning.originX, y: panning.originY, zoom: viewport.zoom },
            event.clientX - panning.startX,
            event.clientY - panning.startY
          )
        );
      }
    };

    const onUp = (event: PointerEvent) => {
      if (draggingTable) {
        const dx = (event.clientX - draggingTable.startX) / viewport.zoom;
        const dy = (event.clientY - draggingTable.startY) / viewport.zoom;
        const point = {
          x: draggingTable.initialX + dx,
          y: draggingTable.initialY + dy,
        };
        setCustomPositions((prev) => {
          const next = { ...prev, [draggingTable.id]: point };
          persistPositions(next);
          return next;
        });
        setDraggingTable(null);
      }
      setPanning(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingTable, panning, persistPositions, viewport.zoom]);

  const isEdgeHot = (edge: ErdEdge) => {
    if (selectedEdgeId === edge.id) return true;
    if (hoveredTableId && (edge.sourceTableId === hoveredTableId || edge.targetTableId === hoveredTableId)) {
      return true;
    }
    return false;
  };

  const empty = database.tables.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      <div className="p-3 bg-card border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Network className="w-4 h-4 text-primary" />
            <span>Interactive Entity Relationship Diagram (ERD)</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
            {database.tables.length} Tables • {edges.length} Relationships
          </span>
          <span className="hidden sm:inline text-[10px] text-muted-foreground font-sans italic">
            Drag canvas to pan • drag table headers to reposition
          </span>
        </div>

        <div className="flex items-center gap-2">
          {Object.keys(customPositions).length > 0 && (
            <button
              onClick={handleResetLayout}
              title="Reset Table Positions"
              className="flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-accent text-foreground text-xs transition-colors border border-border"
            >
              <RotateCcw className="w-3 h-3 text-primary" />
              <span>Reset Layout</span>
            </button>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find table or column..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-background border border-border rounded-lg text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-48"
            />
          </div>

          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
            <button
              onClick={() => zoomTowardCenter(viewport.zoom - 0.1)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] w-12 text-center font-mono">
              {Math.round(clampZoom(viewport.zoom) * 100)}%
            </span>
            <button
              onClick={() => zoomTowardCenter(viewport.zoom + 0.1)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFit}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Fit diagram"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={empty || exporting}
            title="Export PNG"
            className="flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-accent text-foreground text-xs transition-colors border border-border disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            <span>{exporting ? 'Exporting…' : 'PNG'}</span>
          </button>
        </div>
      </div>

      {empty ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No tables in this schema to diagram.
        </div>
      ) : (
        <div
          ref={canvasRef}
          data-erd-canvas
          className={`flex-1 relative overflow-hidden bg-background ${
            panning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handleCanvasPointerDown}
        >
          <div
            className="absolute origin-top-left will-change-transform"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            }}
          >
            <div
              ref={worldRef}
              className="relative bg-background"
              style={{ width: bounds.width, height: bounds.height }}
            >
              <svg
                className="absolute inset-0"
                width={bounds.width}
                height={bounds.height}
                viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
                overflow="visible"
              >
                <defs>
                  <marker
                    id="erd-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
                  </marker>
                  <marker
                    id="erd-arrow-hot"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const hot = isEdgeHot(edge);
                  return (
                    <g key={edge.id} data-erd-edge>
                      <path
                        d={edge.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        className="cursor-pointer"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEdgeId(edge.id);
                        }}
                      />
                      <path
                        d={edge.path}
                        fill="none"
                        stroke={hot ? 'var(--primary)' : 'var(--border)'}
                        strokeWidth={hot ? 2.5 : 1.6}
                        markerEnd={hot ? 'url(#erd-arrow-hot)' : 'url(#erd-arrow)'}
                        className="pointer-events-none transition-[stroke,stroke-width] duration-150"
                      />
                    </g>
                  );
                })}
              </svg>

              {nodes.map((node) => {
                const isHovered = hoveredTableId === node.id;
                const isDraggingThis = draggingTable?.id === node.id;
                const searchHit = searchTableSet.has(node.id);
                const edgeHit =
                  selectedEdge?.sourceTableId === node.id ||
                  selectedEdge?.targetTableId === node.id;

                return (
                  <div
                    key={node.id}
                    data-erd-table
                    onMouseEnter={() => setHoveredTableId(node.id)}
                    onMouseLeave={() => setHoveredTableId(null)}
                    style={{
                      left: node.x - bounds.minX,
                      top: node.y - bounds.minY,
                      width: node.width,
                      height: node.height,
                    }}
                    className={`absolute rounded-xl border shadow-xl bg-card overflow-hidden z-10 flex flex-col ${
                      isDraggingThis
                        ? 'border-primary shadow-primary/20 ring-2 ring-primary/50 z-30 cursor-grabbing'
                        : edgeHit
                        ? 'border-primary ring-2 ring-primary/40 z-20'
                        : searchHit
                        ? 'border-primary ring-2 ring-primary/25 z-20'
                        : isHovered
                        ? 'border-primary shadow-primary/15 ring-1 ring-primary/30 z-20'
                        : 'border-border'
                    }`}
                  >
                    <div
                      onPointerDown={(event) =>
                        handleTablePointerDown(event, node.id, node.x, node.y)
                      }
                      className="h-10 shrink-0 px-2.5 bg-background border-b border-border flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-accent/80 transition-colors touch-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Move className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <TableIcon className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-mono text-xs font-bold text-foreground truncate">
                          {node.table.schema !== 'public'
                            ? `${node.table.schema}.${node.table.name}`
                            : node.table.name}
                        </span>
                      </div>
                      {knownRowCount(node.table.rowCount) !== null && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                          {node.table.rowCount.toLocaleString()} r
                        </span>
                      )}
                    </div>

                    <div className="px-2 font-mono text-[11px] shrink-0">
                      {node.visibleColumns.map((col) => {
                        const nullable = col.isNullable !== false;
                        const highlighted = searchColumnSet.has(
                          columnKey(node.table.id, col.name)
                        );
                        return (
                          <div
                            key={col.name}
                            className={`flex items-center gap-1.5 h-5.5 px-1 rounded ${
                              highlighted ? 'bg-primary/10' : 'hover:bg-accent'
                            }`}
                          >
                            {col.isPrimary ? (
                              <Key className="w-3 h-3 text-amber-400 shrink-0" />
                            ) : col.foreignKey ? (
                              <Link className="w-3 h-3 text-primary shrink-0" />
                            ) : (
                              <div className="w-3 h-3 shrink-0" />
                            )}
                            <span
                              className={`truncate min-w-0 ${
                                nullable ? 'text-muted-foreground' : 'text-foreground'
                              }`}
                            >
                              {col.name}
                              {nullable ? (
                                <span className="text-muted-foreground/70">?</span>
                              ) : null}
                            </span>
                            <span
                              className="ml-auto shrink-0 min-w-18 text-right text-[10px] text-muted-foreground font-sans tabular-nums"
                              title={col.type}
                            >
                              {shortColumnType(col.type)}
                            </span>
                          </div>
                        );
                      })}
                      {node.overflowCount > 0 && (
                        <div className="h-5 px-1 text-[10px] text-muted-foreground">
                          +{node.overflowCount} more
                        </div>
                      )}
                    </div>

                    <div className="mt-auto h-9 px-1.5 bg-background/80 border-t border-border flex items-center justify-between text-[10px] font-mono shrink-0">
                      <button
                        onClick={() => onSelectTableData(node.table)}
                        className="px-2 py-1 rounded bg-muted hover:bg-accent text-primary transition-colors border border-border"
                      >
                        View Data
                      </button>
                      <button
                        onClick={() => onSelectTableSchema(node.table)}
                        className="px-2 py-1 rounded bg-muted hover:bg-accent text-primary transition-colors border border-border"
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
      )}
    </div>
  );
};
