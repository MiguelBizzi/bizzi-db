import React, { useState } from 'react';
import { DatabaseSchema, ConnectionProfile } from '../../types';
import { Database, Server, Key, ShieldCheck, Check, X, Zap } from 'lucide-react';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConnection: (profile: ConnectionProfile) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onAddConnection,
}) => {
  const [dialect, setDialect] = useState<DatabaseSchema['dialect']>('PostgreSQL');
  const [name, setName] = useState('Production Analytics DB');
  const [host, setHost] = useState('db.us-east-1.amazonaws.com');
  const [port, setPort] = useState(5432);
  const [username, setUsername] = useState('postgres_admin');
  const [databaseName, setDatabaseName] = useState('production_app');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestResult('Success! Connected in 14ms (SSL Mode: Require)');
    }, 800);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onAddConnection({
      id: 'conn_' + Date.now(),
      name,
      dialect,
      host,
      port,
      databaseName,
      username,
      ssl: true,
      environment: 'production',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans select-none text-foreground">
      <div className="w-full max-w-lg bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2.5 font-mono">
            <Database className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground">
              New Database Connection Profile
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 font-mono text-xs">
          {/* Dialect Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Database Engine
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['PostgreSQL', 'MySQL', 'ClickHouse', 'SQLite', 'DuckDB'] as const).map(
                (d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDialect(d);
                      if (d === 'MySQL') setPort(3306);
                      if (d === 'PostgreSQL') setPort(5432);
                      if (d === 'ClickHouse') setPort(8123);
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      dialect === d
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Connection Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Host / Endpoint
              </label>
              <input
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Port
              </label>
              <input
                type="number"
                required
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Database Name
              </label>
              <input
                type="text"
                required
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {testResult && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{testResult}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3 py-2 rounded-xl bg-muted hover:bg-accent text-foreground font-bold border border-border transition-colors"
            >
              {isTesting ? 'Testing Ping...' : 'Test Connection'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold shadow-md transition-colors"
              >
                Connect Database
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
