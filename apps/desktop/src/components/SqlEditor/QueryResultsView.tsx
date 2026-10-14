import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { fade } from '../../lib/motion';
import { PendingModifications, QueryExecutionResult, TableSchema } from '../../types';
import { ExplainPlanView } from './ExplainPlanView';
import { AlertCircle, Lock, Table, Network } from 'lucide-react';
import { DataExportMenu } from '../DataExport/DataExportMenu';
import { inferQualifiedTable } from '../../lib/dataExport';
import { queryErrorText, resultTabLabel } from '../../lib/sqlQuery';
import { analyzeQueryResult } from '../../lib/queryResultTable';
import { emptyPending } from '../../lib/pendingChanges';
import { TableDataGrid } from '../TableView/TableDataGrid';
import type { FkLookupFn } from '../TableView/ForeignKeyPicker';

const SKELETON_ROWS = 8;
const SKELETON_COLS = 5;
const SKELETON_WIDTHS = ['w-[38%]', 'w-[55%]', 'w-[46%]', 'w-[62%]', 'w-[42%]', 'w-[70%]'];

/** Hooks the result grid into the app's pending-changes pipeline. */
export interface QueryGridActions {
  tables: TableSchema[];
  getPending: (tableId: string) => PendingModifications;
  onUpdateCell: (
    tableId: string,
    primaryKeyValue: unknown,
    columnName: string,
    oldValue: unknown,
    newValue: unknown
  ) => void;
  onDeleteRows: (
    table: TableSchema,
    primaryKeyValues: unknown[],
    rows: Record<string, unknown>[]
  ) => void;
  onInsertRow: (table: TableSchema, sql: string) => Promise<{ error?: string }>;
  onLookup: FkLookupFn;
  onOpenTable: (table: TableSchema) => void;
  /** Re-runs the result's query and swaps the fresh rows in. */
  onRerun: (result: QueryExecutionResult) => Promise<void>;
}

interface QueryResultsViewProps {
  results: QueryExecutionResult[];
  isLoading?: boolean;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  grid: QueryGridActions;
}

export const QueryResultsView: React.FC<QueryResultsViewProps> = ({
  results,
  isLoading = false,
  activeIndex,
  onActiveIndexChange,
  grid,
}) => {
  const setActiveIndex = onActiveIndexChange;
  const result = results[Math.min(activeIndex, Math.max(results.length - 1, 0))];

  if (isLoading && results.length === 0) {
    return (
      <motion.div
        key="loading"
        variants={fade}
        initial="initial"
        animate="animate"
        className="flex-1 flex flex-col bg-background overflow-hidden h-full min-h-0"
      >
        <ResultsToolbar disabled rows={0} />
        <ResultsSkeleton />
      </motion.div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-background font-mono text-xs h-full">
        <Table className="w-8 h-8 mb-2 opacity-40 text-primary" />
        <p>Run a SQL query above (Cmd + Enter) to view execution results.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col bg-background overflow-hidden h-full min-h-0 ${
        isLoading ? 'pointer-events-none' : ''
      }`}
    >
      {results.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-card border-b border-border overflow-x-auto shrink-0">
          {results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              title={item.query}
              disabled={isLoading}
              onClick={() => setActiveIndex(index)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono whitespace-nowrap transition-colors disabled:opacity-50 ${
                index === activeIndex
                  ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {resultTabLabel(index)}
            </button>
          ))}
        </div>
      )}
      {result ? (
        <SingleResultView key={result.id} result={result} isLoading={isLoading} grid={grid} />
      ) : null}
    </div>
  );
};

function ResultsToolbar({
  disabled,
  rows,
  result,
  activeSubTab,
  onSubTab,
}: {
  disabled: boolean;
  rows: number;
  result?: QueryExecutionResult;
  activeSubTab?: 'grid' | 'explain';
  onSubTab?: (tab: 'grid' | 'explain') => void;
}) {
  const sqlTarget = inferQualifiedTable(result?.query);
  return (
    // Sits above the grid's sticky headers (z-20) so its menus are never covered.
    <div className="relative z-30 px-4 py-2 bg-card border-b border-border flex items-center justify-between shrink-0">
      <ResultSubTabs
        disabled={disabled}
        rows={rows}
        result={result}
        activeSubTab={activeSubTab}
        onSubTab={onSubTab}
      />

      <div className="flex items-center gap-3">
        {result && !disabled && <ExecutionSummary result={result} />}
        {disabled && (
          <div className="text-[11px] text-muted-foreground font-mono">Running query…</div>
        )}
        <DataExportMenu
          columns={result?.columns || []}
          rows={result?.rows || []}
          tableName={sqlTarget.table}
          schema={sqlTarget.schema}
          disabled={disabled}
          disabledReason="Unavailable while the query is running"
        />
      </div>
    </div>
  );
}

function ResultSubTabs({
  disabled,
  rows,
  result,
  activeSubTab,
  onSubTab,
}: {
  disabled: boolean;
  rows: number;
  result?: QueryExecutionResult;
  activeSubTab?: 'grid' | 'explain';
  onSubTab?: (tab: 'grid' | 'explain') => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubTab?.('grid')}
        className={`pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
          (activeSubTab ?? 'grid') === 'grid'
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Table className="w-3.5 h-3.5" />
        <span>Results Grid ({rows})</span>
      </button>

      {result?.explainPlan && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubTab?.('explain')}
          className={`pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
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
  );
}

function ExecutionSummary({ result }: { result: QueryExecutionResult }) {
  return (
    <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
      Executed in <span className="text-emerald-400 font-bold">{result.executionTimeMs}ms</span>
      {result.affectedRows !== undefined && ` • ${result.affectedRows} rows affected`}
      {result.truncated && ' • truncated'}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex-1 overflow-hidden min-h-0" aria-busy="true" aria-label="Loading query results">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-card border-b border-border">
          <tr>
            {Array.from({ length: SKELETON_COLS }, (_, i) => (
              <th key={i} className="px-3 py-2 border-r border-border">
                <span className={`table-skeleton-bar inline-block h-3 ${SKELETON_WIDTHS[i]}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <tr key={row} aria-hidden>
              {Array.from({ length: SKELETON_COLS }, (_, col) => (
                <td key={col} className="px-3 py-2 border-r border-border">
                  <span
                    className={`table-skeleton-bar inline-block h-3 max-w-full ${
                      SKELETON_WIDTHS[(row + col) % SKELETON_WIDTHS.length]
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SingleResultView({
  result,
  isLoading,
  grid,
}: {
  result: QueryExecutionResult;
  isLoading: boolean;
  grid: QueryGridActions;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'explain'>('grid');
  const analysis = useMemo(
    () => analyzeQueryResult(result, grid.tables),
    [result, grid.tables]
  );

  if (result.error && !isLoading) {
    return (
      <motion.div
        key="error"
        variants={fade}
        initial="initial"
        animate="animate"
        className="p-4 bg-background flex-1 overflow-auto"
      >
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 space-y-3 font-mono text-xs shadow-lg">
          <div className="flex items-center gap-2 font-bold text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>SQL Execution Error</span>
          </div>

          <p className="bg-background p-3 rounded-lg border border-red-500/30 leading-relaxed text-red-400">
            {queryErrorText(result.error)}
          </p>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Query failed in {result.executionTimeMs}ms
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  const columns =
    result.columns ||
    (result.rows && result.rows.length > 0 ? Object.keys(result.rows[0]) : []);
  const rows = result.rows || [];
  const showGrid =
    !isLoading && activeSubTab === 'grid' && (rows.length > 0 || analysis.editable);

  if (showGrid) {
    const { table, sourceTable, editable } = analysis;
    return (
      <div className="flex-1 flex flex-col bg-background overflow-hidden font-mono text-xs select-none min-h-0">
        <motion.div
          key="rows"
          variants={fade}
          initial="initial"
          animate="animate"
          className="flex-1 flex flex-col min-h-0"
        >
          <TableDataGrid
            variant="query"
            table={table}
            rows={rows}
            readOnly={!editable}
            readOnlyReason={analysis.readOnlyReason}
            readOnlyColumns={analysis.readOnlyColumns}
            insertTable={sourceTable}
            pendingModifications={editable ? grid.getPending(table.id) : emptyPending()}
            tables={grid.tables}
            onUpdateCell={(pk, col, oldVal, newVal) =>
              grid.onUpdateCell(table.id, pk, col, oldVal, newVal)
            }
            onInsertRow={(sql) =>
              sourceTable
                ? grid.onInsertRow(sourceTable, sql)
                : Promise.resolve({ error: 'This result is read-only.' })
            }
            onDeleteSelectedRows={(pks) => {
              if (sourceTable) grid.onDeleteRows(sourceTable, pks, rows);
            }}
            onLoadRows={() => grid.onRerun(result)}
            onLookup={grid.onLookup}
            onOpenTable={grid.onOpenTable}
            toolbarLeading={
              <ResultSubTabs
                disabled={false}
                rows={rows.length}
                result={result}
                activeSubTab={activeSubTab}
                onSubTab={setActiveSubTab}
              />
            }
            toolbarTrailing={
              <>
                {!editable && analysis.readOnlyReason && (
                  <span
                    title={analysis.readOnlyReason}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10px] font-sans font-medium cursor-help"
                  >
                    <Lock className="w-3 h-3" />
                    Read-only
                  </span>
                )}
                <ExecutionSummary result={result} />
              </>
            }
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden font-mono text-xs select-none min-h-0">
      <ResultsToolbar
        disabled={isLoading}
        rows={rows.length}
        result={result}
        activeSubTab={activeSubTab}
        onSubTab={setActiveSubTab}
      />

      {isLoading ? (
        <ResultsSkeleton />
      ) : (
        <motion.div
          key="rows"
          variants={fade}
          initial="initial"
          animate="animate"
          className="flex-1 table-scroll-port"
        >
          {activeSubTab === 'explain' && result.explainPlan ? (
            <div className="p-2">
              <ExplainPlanView planNode={result.explainPlan} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Query executed successfully in {result.executionTimeMs}ms. 0 rows returned.
            </div>
          ) : (
            <table className="text-left text-xs">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 border-r border-b border-border text-foreground font-bold whitespace-nowrap bg-card"
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
        </motion.div>
      )}
    </div>
  );
}
