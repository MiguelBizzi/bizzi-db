import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DatabaseSchema } from "../../types";
import { formatSizeMb } from "../../lib/format";
import { StorageDistribution } from "./StorageDistribution";
import {
  Activity,
  Server,
  HardDrive,
  Zap,
  Clock,
  ShieldAlert,
} from "lucide-react";

interface DatabaseMetricsProps {
  database: DatabaseSchema;
}

export const DatabaseMetrics: React.FC<DatabaseMetricsProps> = ({
  database,
}) => {
  const qpsData = [
    { time: "16:00", qps: 280, latency: 11 },
    { time: "16:05", qps: 310, latency: 12 },
    { time: "16:10", qps: 420, latency: 18 },
    { time: "16:15", qps: 342, latency: 12 },
    { time: "16:20", qps: 390, latency: 14 },
    { time: "16:25", qps: 355, latency: 13 },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto p-6 font-sans text-foreground space-y-6 select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            <span>Database Performance & Storage Health</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Real-time analytics for {database.name} ({database.dialect})
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            🟢 Status: Healthy
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-card text-foreground border border-border">
            {database.connectionHost}:{database.connectionPort}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Throughput (QPS)</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {database.queriesPerSecond.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-400">↑ +12.4% vs 1h ago</div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Active Connections</span>
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {database.activeConnections} / 50
          </div>
          <div className="text-[10px] text-muted-foreground">
            Pool utilization: 36%
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Cache Hit Ratio</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">99.4%</div>
          <div className="text-[10px] text-emerald-400/80">
            Buffer pool optimal
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Total DB Storage</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatSizeMb(database.totalSizeMb)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {database.tables.length} tables & views
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        <div className="lg:col-span-3 p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="font-bold text-foreground flex items-center justify-between">
            <span>Queries Per Second & Latency Trend</span>
            <span className="text-muted-foreground text-[10px]">
              Last 30 Minutes
            </span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qpsData}>
                <XAxis
                  dataKey="time"
                  stroke="var(--muted-foreground, #64748b)"
                />
                <YAxis stroke="var(--muted-foreground, #64748b)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover, #0f172a)",
                    borderColor: "var(--border, #334155)",
                    color: "var(--popover-foreground, #fff)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="qps"
                  stroke="var(--primary, #6366f1)"
                  strokeWidth={2}
                  dot={{ fill: "var(--primary, #6366f1)" }}
                />
                <Line
                  type="monotone"
                  dataKey="latency"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3">
          <StorageDistribution tables={database.tables} />
        </div>
      </div>
    </div>
  );
};
