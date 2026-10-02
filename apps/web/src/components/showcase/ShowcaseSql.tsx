import { Bookmark, Code, Copy, Download, Play, Save, Table } from 'lucide-react';

const LINES: { text: string; kind?: 'kw' | 'fn' | 'num' }[][] = [
  [
    { text: 'SELECT', kind: 'kw' },
    { text: '\n' },
  ],
  [
    { text: '  u.id,\n' },
  ],
  [
    { text: '  u.email,\n' },
  ],
  [
    { text: '  u.full_name,\n' },
  ],
  [
    { text: '  ' },
    { text: 'COUNT', kind: 'fn' },
    { text: '(o.id) ' },
    { text: 'AS', kind: 'kw' },
    { text: ' order_count\n' },
  ],
  [
    { text: 'FROM', kind: 'kw' },
    { text: ' shop.users u\n' },
  ],
  [
    { text: 'LEFT JOIN', kind: 'kw' },
    { text: ' shop.orders o ' },
    { text: 'ON', kind: 'kw' },
    { text: ' o.user_id = u.id\n' },
  ],
  [
    { text: 'GROUP BY', kind: 'kw' },
    { text: ' u.id, u.email, u.full_name\n' },
  ],
  [
    { text: 'ORDER BY', kind: 'kw' },
    { text: ' order_count ' },
    { text: 'DESC', kind: 'kw' },
    { text: '\n' },
  ],
  [
    { text: 'LIMIT', kind: 'kw' },
    { text: ' ' },
    { text: '50', kind: 'num' },
    { text: ';' },
  ],
];

const RESULTS = [
  { email: 'ava@acme.dev', full_name: 'Ava Patel', order_count: '84' },
  { email: 'jon@acme.dev', full_name: 'Jon Hale', order_count: '41' },
  { email: 'mia@north.io', full_name: 'Mia Chen', order_count: '19' },
];

const RESULT_COLS = ['email', 'full_name', 'order_count'] as const;

function tokenClass(kind?: 'kw' | 'fn' | 'num') {
  if (kind === 'kw') return 'text-secondary';
  if (kind === 'fn') return 'text-primary';
  if (kind === 'num') return 'text-amber-400';
  return 'text-foreground';
}

export function ShowcaseSql() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden font-sans">
      <div className="p-2.5 bg-card border-b border-border flex items-center gap-2 shrink-0 font-mono text-xs">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold font-sans text-xs shadow-md">
          <Play className="w-3.5 h-3.5 fill-white" />
          Run Query (⌘↵)
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-xs border border-border">
          <Code className="w-3.5 h-3.5 text-primary" />
          Format SQL
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium border border-border">
          <Save className="w-3.5 h-3.5 text-amber-400" />
          Save
        </span>
        <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium border border-border">
          <Bookmark className="w-3.5 h-3.5 text-secondary" />
          Saved Queries (0)
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-[0.55] min-h-0 overflow-auto showcase-scroll bg-background">
          <div className="flex font-mono text-xs leading-[1.5] h-full">
            <div className="w-10 shrink-0 py-2 text-right pr-2 text-muted-foreground select-none bg-muted/40">
              {LINES.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="flex-1 py-2 px-3 whitespace-pre">
              {LINES.map((line, i) => (
                <span key={i}>
                  {line.map((token, j) => (
                    <span key={j} className={tokenClass(token.kind)}>
                      {token.text}
                    </span>
                  ))}
                </span>
              ))}
            </pre>
          </div>
        </div>

        <div className="flex-[0.45] min-h-0 flex flex-col border-t border-border bg-background overflow-hidden font-mono text-xs">
          <div className="px-4 py-2 bg-card border-b border-border flex items-center justify-between shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 text-xs font-semibold font-sans">
              <Table className="w-3.5 h-3.5" />
              Results Grid (3)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground">
                Executed in <span className="text-emerald-400 font-bold">12ms</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-foreground text-xs font-medium font-sans">
                <Copy className="w-3.5 h-3.5" />
                Copy
              </span>
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-foreground text-xs font-medium font-sans">
                <Download className="w-3.5 h-3.5" />
                Export
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto showcase-scroll showcase-table-scroll min-h-0">
            <table className="text-left text-xs w-max min-w-full">
              <thead>
                <tr>
                  {RESULT_COLS.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 border-r border-b border-border text-foreground font-bold whitespace-nowrap bg-card"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RESULTS.map((row) => (
                  <tr key={row.email} className="hover:bg-accent/60">
                    {RESULT_COLS.map((col) => (
                      <td
                        key={col}
                        className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground"
                      >
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
