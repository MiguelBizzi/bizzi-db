import React from 'react';
import { ExplainPlanNode } from '../../types';
import { Network, Zap, Clock, Layers, Filter } from 'lucide-react';

interface ExplainPlanViewProps {
  planNode: ExplainPlanNode;
}

export const ExplainPlanView: React.FC<ExplainPlanViewProps> = ({ planNode }) => {
  const renderNode = (node: ExplainPlanNode, depth: number = 0) => {
    const getNodeTypeColor = (type: string) => {
      if (type.includes('Index')) return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300';
      if (type.includes('Seq Scan')) return 'border-rose-500/40 bg-rose-950/20 text-rose-300';
      if (type.includes('Join')) return 'border-purple-500/40 bg-purple-950/20 text-purple-300';
      return 'border-indigo-500/40 bg-indigo-950/20 text-indigo-300';
    };

    return (
      <div key={Math.random()} className="space-y-2" style={{ marginLeft: depth * 24 }}>
        <div
          className={`p-3 rounded-xl border font-mono text-xs shadow-md transition-all ${getNodeTypeColor(
            node.nodeType
          )}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{node.nodeType}</span>
              {node.relationName && (
                <span className="px-2 py-0.5 rounded bg-muted text-foreground border border-border font-semibold">
                  on {node.relationName}
                </span>
              )}
              {node.indexName && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  using {node.indexName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                Cost: {node.startupCost.toFixed(2)}..{node.totalCost.toFixed(2)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-primary" />
                {node.actualTotalTimeMs ? `${node.actualTotalTimeMs}ms` : 'Est.'}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-blue-400" />
                Rows: {node.actualRows ?? node.planRows}
              </span>
            </div>
          </div>

          {node.indexCond && (
            <div className="mt-2 text-[11px] text-emerald-300/80 bg-background/80 p-1.5 rounded border border-border flex items-center gap-1">
              <Filter className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Index Cond: {node.indexCond}</span>
            </div>
          )}

          {node.filter && (
            <div className="mt-2 text-[11px] text-rose-300/80 bg-background/80 p-1.5 rounded border border-border flex items-center gap-1">
              <Filter className="w-3 h-3 text-rose-400 shrink-0" />
              <span>Filter: {node.filter}</span>
            </div>
          )}
        </div>

        {node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-4 bg-background border border-border rounded-xl space-y-3 font-sans">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs font-bold text-foreground">
            EXPLAIN ANALYZE Execution Tree Graph
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          PostgreSQL Query Optimizer Output
        </span>
      </div>

      <div className="space-y-3 pt-2">{renderNode(planNode)}</div>
    </div>
  );
};
