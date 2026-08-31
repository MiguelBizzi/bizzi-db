import React, { useState } from 'react';
import { QueryExecutionResult } from '../../types';
import { ExplainPlanView } from './ExplainPlanView';
import { AlertCircle, Check, Download, Table, Network } from 'lucide-react';

interface QueryResultsViewProps {
  result: QueryExecutionResult | null;
}

export const QueryResultsView: React.FC<QueryResultsViewProps> = ({
  result,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'explain'>('grid');

  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-background font-mono text-xs">
        <Table className="w-8 h-8 mb-2 opacity-40 text-primary" />
        <p>Run a SQL query above (Cmd + Enter) to view execution results.</p>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4 bg-background flex-1 overflow-auto">
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/40 text-destructive-foreground space-y-3 font-mono text-xs shadow-lg">
          <div className="flex items-center gap-2 font-bold text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>SQL Execution Error</span>
          </div>

          <p className="bg-background p-3 rounded-lg border border-destructive/30 leading-relaxed text-destructive-foreground">
            {result.error}
          </p>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Query failed in {result.executionTimeMs}ms
            </span>
          </div>
        </div>
      </div>
    );
  }

  const columns = result.columns || (result.rows && result.rows.length > 0 ? Object.keys(result.rows[0]) : []);
  const rows = result.rows || [];

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden font-mono text-xs select-none">
      {/* Results Header Bar */}
      <div className="px-4 py-2 bg-card border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSubTab('grid')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'grid'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Results Grid ({rows.length})</span>
          </button>

          {result.explainPlan && (
            <button
              onClick={() => setActiveSubTab('explain')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'explain'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>EXPLAIN Plan</span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground font-mono">
          Executed in <span className="text-emerald-400 font-bold">{result.executionTimeMs}ms</span>
          {result.affectedRows !== undefined && ` • ${result.affectedRows} rows affected`}
          {result.truncated && ' • truncated'}
        </div>
      </div>

      {/* Body View */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-muted p-2">
        {activeSubTab === 'explain' && result.explainPlan ? (
          <ExplainPlanView planNode={result.explainPlan} />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Query executed successfully in {result.executionTimeMs}ms. 0 rows returned.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-card border-b border-border sticky top-0">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 border-r border-border text-foreground font-bold whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-accent/60 transition-colors">
                  {columns.map((col) => {
                    const val = row[col];
                    return (
                      <td key={col} className="px-3 py-2 border-r border-border whitespace-nowrap text-foreground">
                        {val === null || val === undefined ? (
                          <span className="text-muted-foreground/60 italic">NULL</span>
                        ) : typeof val === 'object' ? (
                          JSON.stringify(val)
                        ) : (
                          String(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
