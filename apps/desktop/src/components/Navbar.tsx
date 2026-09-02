import {
  Database,
  Search,
  Activity,
  Plus,
  Logs,
  ChevronDown,
  ChevronRight,
  Folder,
  ListChecks,
  Settings,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { handleTitlebarMouseDown } from "../lib/windowDrag";
import { ConnectionFolder, ConnectionProfile, DatabaseSchema } from "../types";
import { PostgresLogo } from "./icons/PostgresLogo";
import {
  connectionSwitcherEntries,
  groupConnections,
} from "../lib/connectionFolders";
import { useHoverMenu } from "../lib/hoverMenu";

const PALETTE_SHORTCUT = /Mac|iPhone|iPad|iPod/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
)
  ? "⌘K"
  : "Ctrl+K";

interface NavbarProps {
  profiles: ConnectionProfile[];
  folders: ConnectionFolder[];
  currentDatabase: DatabaseSchema | null;
  variant?: "picker" | "workspace";
  pendingCount?: number;
  onSelectDatabase: (dbId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenActivityLog: () => void;
  onOpenPendingChanges: () => void;
  onOpenNewConnection: () => void;
  onOpenMetrics: () => void;
  onOpenSettings: () => void;
  onBackToConnections?: () => void;
}

function SwitcherFolderRow({
  name,
  count,
  profiles,
  currentId,
  onSelect,
}: {
  name: string;
  count: number;
  profiles: ConnectionProfile[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  const { open, onMouseEnter, onMouseLeave } = useHoverMenu();

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-xs font-medium text-popover-foreground hover:bg-accent">
        <span className="flex items-center gap-2 min-w-0">
          <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {count}
          </span>
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        </span>
      </div>
      {open && (
        <div role="menu" className="absolute top-0 left-full z-50 pl-1">
          <div className="min-w-44 bg-popover border border-border rounded-xl shadow-2xl p-1.5">
            {profiles.length === 0 ? (
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                No connections
              </div>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitem"
                  onClick={() => onSelect(profile.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-colors ${
                    profile.id === currentId
                      ? "bg-primary/20 text-primary font-semibold"
                      : "text-popover-foreground hover:bg-accent"
                  }`}
                >
                  <PostgresLogo className="w-4 h-4 shrink-0" />
                  <span className="truncate font-mono">{profile.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  profiles,
  folders,
  currentDatabase,
  variant = "workspace",
  pendingCount = 0,
  onSelectDatabase,
  onOpenCommandPalette,
  onOpenActivityLog,
  onOpenPendingChanges,
  onOpenNewConnection,
  onOpenMetrics,
  onOpenSettings,
  onBackToConnections,
}) => {
  const isPicker = variant === "picker";
  const switcher = useHoverMenu();

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
      onMouseDown={(event) => {
        handleTitlebarMouseDown(event, () => {
          void getCurrentWindow()
            .startDragging()
            .catch(() => {});
        });
      }}
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
          <span>Bizzi DB</span>
        </button>

        {!isPicker && (
          <>
            <div
              className="relative"
              data-no-drag
              onMouseEnter={switcher.onMouseEnter}
              onMouseLeave={switcher.onMouseLeave}
            >
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent border border-border cursor-pointer transition-colors text-xs font-medium text-foreground"
              >
                <PostgresLogo className="w-4 h-4 shrink-0" />
                <span className="max-w-[160px] truncate font-mono">
                  {currentDatabase?.name || "No connection"}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-1" />
              </button>

              {switcher.open && (
                <div className="absolute top-full left-0 z-50 pt-1 w-64">
                  <div className="bg-popover border border-border rounded-xl shadow-2xl p-1.5">
                    <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Connections
                    </div>
                    {profiles.length === 0 && (
                      <div className="px-2.5 py-2 text-xs text-muted-foreground">
                        No saved connections
                      </div>
                    )}
                    {connectionSwitcherEntries(
                      groupConnections(folders, profiles),
                    ).map((entry) =>
                      entry.kind === "connection" ? (
                        <button
                          key={entry.profile.id}
                          type="button"
                          onClick={() => onSelectDatabase(entry.profile.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                            entry.profile.id === currentDatabase?.id
                              ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                              : "text-popover-foreground hover:bg-accent"
                          }`}
                        >
                          <PostgresLogo className="w-4 h-4 shrink-0" />
                          <span className="truncate font-mono">
                            {entry.profile.name}
                          </span>
                        </button>
                      ) : (
                        <SwitcherFolderRow
                          key={entry.folder.id}
                          name={entry.folder.name}
                          count={entry.count}
                          profiles={entry.profiles}
                          currentId={currentDatabase?.id}
                          onSelect={onSelectDatabase}
                        />
                      ),
                    )}

                    <div className="my-1 border-t border-border" />

                    <button
                      type="button"
                      onClick={onOpenNewConnection}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-primary hover:bg-accent rounded-lg transition-colors font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Connect New Database...</span>
                    </button>
                  </div>
                </div>
              )}
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
        <button
          type="button"
          onClick={onOpenCommandPalette}
          title={`Open command palette (${PALETTE_SHORTCUT})`}
          className="hidden md:flex items-center justify-between w-80 px-3 py-1.5 rounded-lg bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all text-xs cursor-pointer group shadow-inner"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span>Search tables, queries, actions...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded text-muted-foreground">
            {PALETTE_SHORTCUT}
          </kbd>
        </button>
      )}

      <div className="flex items-center gap-2">
        {!isPicker && (
          <>
            <button
              type="button"
              onClick={onOpenPendingChanges}
              title={
                pendingCount > 0
                  ? `${pendingCount} pending change${pendingCount === 1 ? "" : "s"}`
                  : "Pending changes"
              }
              className={`relative p-2 rounded-lg border transition-colors ${
                pendingCount > 0
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-muted hover:bg-accent border-border text-foreground"
              }`}
            >
              {pendingCount > 0 && (
                <span className="pending-changes-ring" aria-hidden />
              )}
              <ListChecks className="w-4 h-4 relative z-10" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 z-10 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold flex items-center justify-center leading-none">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>

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
          </>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="p-2 rounded-lg bg-muted hover:bg-accent border border-border text-foreground transition-colors"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
};
