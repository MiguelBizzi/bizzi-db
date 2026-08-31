import { useState } from 'react';
import {
  Database,
  Plus,
  Trash2,
  Loader2,
  ShieldAlert,
  Plug,
} from 'lucide-react';
import { ConnectionProfile } from '../types';
import { PostgresLogo } from './icons/PostgresLogo';

interface ConnectionPickerProps {
  ready: boolean;
  profiles: ConnectionProfile[];
  connectingId: string | null;
  connectError: string | null;
  loadError: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewConnection: () => void;
}

function envBadge(env: string) {
  switch (env) {
    case 'production':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'staging':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    default:
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  }
}

export const ConnectionPicker: React.FC<ConnectionPickerProps> = ({
  ready,
  profiles,
  connectingId,
  connectError,
  loadError,
  onSelect,
  onDelete,
  onNewConnection,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const busy = connectingId !== null;

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a database to open, or add a new connection.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewConnection}
            disabled={busy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New connection
          </button>
        </div>

        {(loadError || connectError) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2.5 text-sm">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{connectError || loadError}</span>
          </div>
        )}

        {!ready ? (
          <div className="rounded-2xl border border-border bg-card px-8 py-16 text-center text-sm text-muted-foreground">
            Loading connections…
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-8 py-16 flex flex-col items-center text-center">
            <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-4">
              <Database className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold">No connections yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Save a PostgreSQL connection to inspect schema, preview tables, and run SQL.
            </p>
            <button
              type="button"
              onClick={onNewConnection}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add connection
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {profiles.map((profile) => {
              const isConnecting = connectingId === profile.id;
              const confirming = pendingDeleteId === profile.id;
              return (
                <li key={profile.id}>
                  <div
                    className={`w-full rounded-2xl border bg-card text-left transition-colors ${
                      isConnecting
                        ? 'border-primary/40'
                        : 'border-border hover:border-primary/40 hover:bg-accent/40'
                    }`}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSelect(profile.id)}
                        className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3 disabled:opacity-60"
                      >
                        <div className="p-2 rounded-xl bg-muted border border-border text-primary shrink-0">
                          {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <PostgresLogo className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">
                              {profile.name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border font-mono ${envBadge(
                                profile.environment
                              )}`}
                            >
                              {profile.environment}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                            {profile.user}@{profile.host}:{profile.port}/{profile.database}
                          </p>
                        </div>
                        {isConnecting && (
                          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                            <Plug className="w-3 h-3" />
                            Connecting…
                          </span>
                        )}
                      </button>

                      <div className="flex items-center pr-2">
                        {confirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setPendingDeleteId(null);
                                onDelete(profile.id);
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-accent"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            title="Delete connection"
                            onClick={() => setPendingDeleteId(profile.id)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
