import { Code, Plus, Table as TableIcon } from "lucide-react";

const PALETTE_SHORTCUT = /Mac|iPhone|iPad|iPod/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
)
  ? "⌘K"
  : "Ctrl+K";

interface WorkspaceEmptyStateProps {
  onOpenNewQuery: () => void;
}

export function WorkspaceEmptyState({
  onOpenNewQuery,
}: WorkspaceEmptyStateProps) {
  return (
    <div className="h-full w-full flex items-center justify-center p-6 relative overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none"
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-card px-8 py-12 flex flex-col items-center text-center">
        <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-4">
          <Code className="w-7 h-7" />
        </div>
        <h2 className="text-base font-semibold tracking-tight">
          Nothing open yet
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Pick a table from the explorer, or start a SQL query to inspect this
          database.
        </p>

        <div className="mt-5 w-full max-w-xs space-y-2 text-left">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2">
            <TableIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs text-muted-foreground">
              Open a table from the sidebar
            </span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2">
            <Code className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs text-muted-foreground">
              Write SQL in a new query tab
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenNewQuery}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          New query
        </button>
        <p className="mt-3 text-[11px] font-mono text-muted-foreground">
          or press{" "}
          <kbd className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-foreground">
            {PALETTE_SHORTCUT}
          </kbd>{" "}
          for commands
        </p>
      </div>
    </div>
  );
}
