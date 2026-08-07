import React from 'react';
import {
  Database,
  Search,
  Sparkles,
  Activity,
  Server,
  Plus,
  Terminal,
  Sun,
  Moon,
  ChevronDown,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { DatabaseSchema, ConnectionProfile } from '../types';

interface NavbarProps {
  databases: DatabaseSchema[];
  currentDatabase: DatabaseSchema;
  connections: ConnectionProfile[];
  onSelectDatabase: (dbId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenAiAssistant: () => void;
  onOpenActivityLog: () => void;
  onOpenNewConnection: () => void;
  onOpenMetrics: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  databases,
  currentDatabase,
  connections,
  onSelectDatabase,
  onOpenCommandPalette,
  onOpenAiAssistant,
  onOpenActivityLog,
  onOpenNewConnection,
  onOpenMetrics,
  isDarkMode,
  onToggleTheme,
}) => {
  const getEnvBadgeColor = (env: string) => {
    switch (env) {
      case 'production':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'staging':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'development':
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <header className="h-13 bg-card border-b border-border text-card-foreground flex items-center justify-between px-4 select-none z-30 shrink-0">
      {/* Left: App Logo & DB Selector */}
      <div className="flex items-center gap-3">
        {/* Mac OS Window Controls decoration */}
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/50" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/50" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/50" />
        </div>

        {/* Brand */}
        <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground pr-3 border-r border-border">
          <div className="p-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30">
            <Database className="w-4 h-4" />
          </div>
          <span>DB Pro Studio</span>
        </div>

        {/* Database Dropdown Selector */}
        <div className="relative group">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent border border-border cursor-pointer transition-colors text-xs font-medium text-foreground">
            <Server className="w-3.5 h-3.5 text-primary" />
            <span className="max-w-[160px] truncate font-mono">
              {currentDatabase.name}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider font-mono border bg-background text-muted-foreground border-border">
              {currentDatabase.dialect}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-1 group-hover:text-foreground" />
          </div>

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-xl shadow-2xl p-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
            <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Connected Databases
            </div>
            {databases.map((db) => (
              <button
                key={db.id}
                onClick={() => onSelectDatabase(db.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  db.id === currentDatabase.id
                    ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                    : 'text-popover-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">{db.name}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {db.dialect}
                </span>
              </button>
            ))}

            <div className="my-1 border-t border-border" />

            <button
              onClick={onOpenNewConnection}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-primary hover:bg-accent rounded-lg transition-colors font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect New Database...</span>
            </button>
          </div>
        </div>

        {/* Environment Badge */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border font-mono ${getEnvBadgeColor(
            currentDatabase.environment
          )}`}
        >
          {currentDatabase.environment}
        </span>
      </div>

      {/* Middle: Command Search Bar */}
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

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Gemini AI Assistant Quick Action */}
        <button
          onClick={onOpenAiAssistant}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium shadow-md border border-primary/30 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">Ask Gemini AI</span>
        </button>

        {/* Performance Metrics Toggle */}
        <button
          onClick={onOpenMetrics}
          title="Database Metrics & Health"
          className="p-2 rounded-lg bg-muted hover:bg-accent border border-border text-foreground transition-colors"
        >
          <Activity className="w-4 h-4 text-emerald-400" />
        </button>

        {/* Audit Log / Stream Toggle */}
        <button
          onClick={onOpenActivityLog}
          title="Activity Audit Log"
          className="p-2 rounded-lg bg-muted hover:bg-accent border border-border text-foreground transition-colors relative"
        >
          <Terminal className="w-4 h-4 text-secondary" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-secondary animate-ping" />
        </button>

        {/* Status Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono font-medium">
          <Zap className="w-3 h-3 fill-emerald-400 text-emerald-400" />
          <span>{currentDatabase.queriesPerSecond} qps</span>
        </div>
      </div>
    </header>
  );
};
