import React from 'react';
import { ActivityLogItem } from '../../types';
import { Logs, CheckCircle, AlertTriangle, User, X } from 'lucide-react';

interface ActivityLogDrawerProps {
  logs: ActivityLogItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const ActivityLogDrawer: React.FC<ActivityLogDrawerProps> = ({
  logs,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-popover border-l border-border shadow-2xl flex flex-col font-sans select-none text-popover-foreground">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background/60 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono font-bold text-xs text-foreground">
          <Logs className="w-4 h-4 text-secondary" />
          <span>Database Activity Audit Stream ({logs.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Log Stream Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs scrollbar-thin scrollbar-thumb-muted">
        {logs.map((log) => (
          <div
            key={log.id}
            className="p-3 rounded-xl bg-background border border-border space-y-1.5 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                {log.status === 'SUCCESS' ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span className="font-bold text-primary">{log.type}</span>
                <span className="text-muted-foreground">• {log.databaseName}</span>
              </div>

              <span className="text-[10px] text-muted-foreground">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="p-2 rounded bg-card text-foreground text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-border">
              {log.query}
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
              <span>Duration: {log.executionTimeMs}ms</span>
              <span>Rows affected: {log.rowsAffected}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="w-3 h-3" />
                {log.user}
              </span>
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No query activities logged yet.
          </div>
        )}
      </div>
    </div>
  );
};
