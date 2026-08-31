import {
  Database,
  Search,
  Activity,
  Server,
  Plus,
  Logs,
  ChevronDown,
  Zap,
} from "lucide-react";
import { DatabaseSchema } from "../types";
import { PostgresLogo } from "./icons/PostgresLogo";

interface NavbarProps {
  databases: DatabaseSchema[];
  currentDatabase: DatabaseSchema | null;
  variant?: "picker" | "workspace";
  onSelectDatabase: (dbId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenActivityLog: () => void;
  onOpenNewConnection: () => void;
  onOpenMetrics: () => void;
  onBackToConnections?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  databases,
  currentDatabase,
  variant = "workspace",
  onSelectDatabase,
  onOpenCommandPalette,
  onOpenActivityLog,
  onOpenNewConnection,
  onOpenMetrics,
  onBackToConnections,
}) => {
  const isPicker = variant === "picker";

  const getEnvBadgeColor = (env: string) => {
    switch (env) {
      case "production":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "staging":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "development":
      default:
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-13 bg-card border-b border-border text-card-foreground flex items-center justify-between pl-24 pr-4 select-none z-30 shrink-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={isPicker ? undefined : onBackToConnections}
          title={isPicker ? undefined : "All connections"}
          className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground pr-3 border-r border-border"
        >
          <div className="p-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30">
            <Database className="w-4 h-4" />
          </div>
          <span>DB Pro Studio</span>
        </button>

        {!isPicker && (
          <>
            <div className="relative group">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent border border-border cursor-pointer transition-colors text-xs font-medium text-foreground">
                <PostgresLogo className="w-4 h-4 shrink-0" />
                <span className="max-w-[160px] truncate font-mono">
                  {currentDatabase?.name || "No connection"}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-1 group-hover:text-foreground" />
              </div>

              <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-xl shadow-2xl p-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Connected Databases
                </div>
                {databases.length === 0 && (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">
                    No saved connections
                  </div>
                )}
                {databases.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => onSelectDatabase(db.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      db.id === currentDatabase?.id
                        ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                        : "text-popover-foreground hover:bg-accent"
                    }`}
                  >
                    <PostgresLogo className="w-4 h-4 shrink-0" />
                    <span className="truncate font-mono">{db.name}</span>
                  </button>
                ))}

                <div className="my-1 border-t border-border" />

                <button
                  onClick={onBackToConnections}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-lg transition-colors font-medium"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>All connections...</span>
                </button>
                <button
                  onClick={onOpenNewConnection}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-primary hover:bg-accent rounded-lg transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect New Database...</span>
                </button>
              </div>
            </div>

            {currentDatabase && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border font-mono ${getEnvBadgeColor(
                  currentDatabase.environment,
                )}`}
              >
                {currentDatabase.environment}
              </span>
            )}
          </>
        )}
      </div>

      {!isPicker && (
        <>
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center justify-between w-80 px-3 py-1.5 rounded-lg bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all text-xs cursor-pointer group shadow-inner"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span>Search tables, queries, actions...</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenMetrics}
              title="Database Metrics & Health"
              className="p-2 rounded-lg bg-muted hover:bg-accent border border-border text-foreground transition-colors"
            >
              <Activity className="w-4 h-4 text-emerald-400" />
            </button>

            <button
              onClick={onOpenActivityLog}
              title="Activity Audit Log"
              className="p-2 rounded-lg bg-muted hover:bg-accent border border-border text-foreground transition-colors"
            >
              <Logs className="w-4 h-4 text-secondary" />
            </button>
          </div>
        </>
      )}
    </header>
  );
};
