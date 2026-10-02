import {
  Download,
  Key,
  Link,
  Maximize2,
  Move,
  Network,
  Search,
  Table as TableIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type ErdCol = {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  nullable?: boolean;
};

type ErdCard = {
  id: string;
  name: string;
  rows: string;
  x: number;
  y: number;
  columns: ErdCol[];
};

const CARDS: ErdCard[] = [
  {
    id: 'organizations',
    name: 'shop.organizations',
    rows: '12 r',
    x: 28,
    y: 72,
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'name', type: 'text' },
      { name: 'slug', type: 'text' },
    ],
  },
  {
    id: 'users',
    name: 'shop.users',
    rows: '1,420 r',
    x: 280,
    y: 24,
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'org_id', type: 'uuid', fk: true },
      { name: 'email', type: 'text' },
      { name: 'full_name', type: 'text', nullable: true },
    ],
  },
  {
    id: 'orders',
    name: 'shop.orders',
    rows: '8,204 r',
    x: 532,
    y: 72,
    columns: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'user_id', type: 'uuid', fk: true },
      { name: 'total_cents', type: 'int4' },
      { name: 'status', type: 'text', nullable: true },
    ],
  },
];

const CARD_W = 208;
const HEADER_H = 40;
const ROW_H = 22;
const FOOTER_H = 36;

function cardHeight(columns: number) {
  return HEADER_H + columns * ROW_H + 8 + FOOTER_H;
}

function portY(cardY: number, columnIndex: number) {
  return cardY + HEADER_H + columnIndex * ROW_H + ROW_H / 2;
}

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  const goingRight = x2 >= x1;
  const c1x = x1 + (goingRight ? dx : -dx);
  const c2x = x2 + (goingRight ? -dx : dx);
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

const EDGES = [
  {
    id: 'users.org_id->organizations.id',
    d: edgePath(
      CARDS[1].x,
      portY(CARDS[1].y, 1),
      CARDS[0].x + CARD_W,
      portY(CARDS[0].y, 0),
    ),
  },
  {
    id: 'orders.user_id->users.id',
    d: edgePath(
      CARDS[2].x,
      portY(CARDS[2].y, 1),
      CARDS[1].x + CARD_W,
      portY(CARDS[1].y, 0),
    ),
  },
];

export function ShowcaseErd() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <div className="p-3 bg-card border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Network className="w-4 h-4 text-primary" />
            <span className="truncate">Interactive Entity Relationship Diagram (ERD)</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold shrink-0">
            3 Tables • 2 Relationships
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative h-7 hidden sm:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <div className="h-7 pl-8 pr-3 flex items-center bg-background border border-border rounded-lg text-xs font-mono text-muted-foreground leading-none whitespace-nowrap w-48 overflow-hidden">
              Find table or column...
            </div>
          </div>
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
            <span className="p-1 text-muted-foreground">
              <ZoomOut className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] w-12 text-center font-mono">100%</span>
            <span className="p-1 text-muted-foreground">
              <ZoomIn className="w-3.5 h-3.5" />
            </span>
            <span className="p-1 text-muted-foreground">
              <Maximize2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-muted text-foreground text-xs border border-border">
            <Download className="w-3 h-3" />
            PNG
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto showcase-scroll bg-background cursor-grab">
        <div className="relative" style={{ width: 760, height: 340 }}>
          <svg
            className="absolute inset-0"
            width={760}
            height={340}
            overflow="visible"
          >
          <defs>
            <marker
              id="showcase-erd-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
            </marker>
          </defs>
          {EDGES.map((edge) => (
            <path
              key={edge.id}
              d={edge.d}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1.6"
              markerEnd="url(#showcase-erd-arrow)"
            />
          ))}
        </svg>

        {CARDS.map((card) => (
          <div
            key={card.id}
            className="absolute rounded-xl border border-border shadow-xl bg-card overflow-hidden flex flex-col"
            style={{
              left: card.x,
              top: card.y,
              width: CARD_W,
              height: cardHeight(card.columns.length),
            }}
          >
            <div className="h-10 shrink-0 px-2.5 bg-background border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Move className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <TableIcon className="w-4 h-4 text-primary shrink-0" />
                <span className="font-mono text-xs font-bold text-foreground truncate">
                  {card.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                {card.rows}
              </span>
            </div>
            <div className="px-2 font-mono text-[11px] shrink-0">
              {card.columns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-1.5 h-5.5 px-1 rounded"
                >
                  {col.pk ? (
                    <Key className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : col.fk ? (
                    <Link className="w-3 h-3 text-primary shrink-0" />
                  ) : (
                    <div className="w-3 h-3 shrink-0" />
                  )}
                  <span
                    className={`truncate min-w-0 ${
                      col.nullable ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {col.name}
                    {col.nullable ? (
                      <span className="text-muted-foreground/70">?</span>
                    ) : null}
                  </span>
                  <span className="ml-auto shrink-0 text-right text-[10px] text-muted-foreground font-sans tabular-nums">
                    {col.type}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-auto h-9 px-1.5 bg-background/80 border-t border-border flex items-center justify-between text-[10px] font-mono">
              <span className="px-2 py-1 rounded bg-muted text-primary border border-border">
                View Data
              </span>
              <span className="px-2 py-1 rounded bg-muted text-primary border border-border">
                Edit Schema
              </span>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
