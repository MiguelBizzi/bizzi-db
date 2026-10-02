import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns,
  Copy,
  ChevronDown,
  Download,
  Filter,
  Key,
  Link,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

const COLUMNS = [
  { name: 'id', type: 'uuid', pk: true },
  { name: 'org_id', type: 'uuid', fk: true },
  { name: 'email', type: 'text' },
  { name: 'full_name', type: 'text' },
  { name: 'role', type: 'text' },
  { name: 'created_at', type: 'timestamptz' },
];

const ROWS = [
  {
    id: 'a1c4e902-4b11-4c0a-9e02-1f8c3d77aa01',
    org_id: 'org_acme',
    email: 'ava@acme.dev',
    full_name: 'Ava Patel',
    role: 'admin',
    created_at: '2026-01-12 09:14:02+00',
  },
  {
    id: 'b8d111c0-2e44-4a91-8c10-0b2d4e19bb02',
    org_id: 'org_acme',
    email: 'jon@acme.dev',
    full_name: 'Jon Hale',
    role: 'engineer',
    created_at: '2026-02-03 16:41:55+00',
  },
  {
    id: 'c02f9aa1-7d18-41b2-91f0-6a4c8e33cc03',
    org_id: 'org_north',
    email: 'mia@north.io',
    full_name: 'Mia Chen',
    role: 'analyst',
    created_at: '2026-03-19 11:02:18+00',
  },
  {
    id: 'd77a40e3-9c05-4ee1-b4aa-3d1f6b55dd04',
    org_id: 'org_north',
    email: 'leo@north.io',
    full_name: 'Leo Okonkwo',
    role: 'engineer',
    created_at: '2026-04-08 08:27:41+00',
  },
  {
    id: 'e19bc55d-0aa7-48c3-a812-8e2a9c66ee05',
    org_id: 'org_acme',
    email: 'sam@acme.dev',
    full_name: 'Sam Rivera',
    role: 'engineer',
    created_at: '2026-05-21 19:33:09+00',
  },
];

function MockCheckbox() {
  return (
    <span className="inline-flex h-4 w-4 rounded-[5px] border border-border bg-background" />
  );
}

function ToolButton({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-foreground text-xs font-medium">
      {children}
    </span>
  );
}

export function ShowcaseGrid() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      <div className="bg-card border-b border-border p-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative h-7 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <div className="h-7 pl-8 pr-3 flex items-center bg-background border border-border rounded-lg text-xs font-mono text-muted-foreground leading-none whitespace-nowrap w-48 sm:w-60 overflow-hidden">
                Search data in rows...
              </div>
            </div>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background text-muted-foreground border border-border text-xs font-medium">
              <Filter className="w-3.5 h-3.5" />
              Filters (0)
            </span>
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background text-muted-foreground border border-border text-xs font-medium">
              <Columns className="w-3.5 h-3.5" />
              Hide Columns
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium">
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="p-1.5 rounded-lg bg-background border border-border text-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
            </span>
            <ToolButton>
              <Copy className="w-3.5 h-3.5" />
              Copy
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </ToolButton>
            <ToolButton>
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </ToolButton>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto showcase-scroll showcase-table-scroll min-h-0">
        <table className="text-left text-xs font-mono">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2 text-center border-r border-b border-border bg-card">
                <MockCheckbox />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-2.5 border-r border-b border-border bg-card font-semibold text-foreground whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    {col.pk && (
                      <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {col.fk && (
                      <Link className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span>{col.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal font-sans">
                      ({col.type})
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {ROWS.map((row) => (
              <tr key={row.id} className="hover:bg-accent/50">
                <td className="px-3 py-2 text-center border-r border-border">
                  <MockCheckbox />
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.id}
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.org_id}
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.email}
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.full_name}
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.role}
                </td>
                <td className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                  {row.created_at}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1.5 bg-card border-t border-border text-xs font-mono text-muted-foreground flex items-center justify-between gap-3 shrink-0">
        <span className="truncate">Showing 1–5 of 1,420</span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[11px]">Rows</span>
            <span className="px-2 py-0.5 rounded-md bg-background border border-border text-foreground">
              50
            </span>
          </div>
          <div className="flex items-center gap-0.5 text-foreground">
            <span className="p-1 rounded-md opacity-30">
              <ChevronsLeft className="w-3.5 h-3.5" />
            </span>
            <span className="p-1 rounded-md opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" />
            </span>
            <span className="px-1.5 text-[11px] tabular-nums">1 / 29</span>
            <span className="p-1 rounded-md">
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
            <span className="p-1 rounded-md">
              <ChevronsRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
