import { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { exportReveal, exportSaveFile } from '@db/core';
import type { DocumentCommandResult, QueryErrorPosition } from '@db/shared';
import { flattenTree, treeKey, type TreeRow } from '../../lib/document/docTree';
import { resultDocuments, resultExportFile, resultSummary } from '../../lib/document/documentResults';
import { invokeErrorMessage } from '../../lib/invokeError';
import { toast } from '../../lib/toast';
import { QueryErrorCard } from '../SqlEditor/QueryErrorCard';
import { useGridWindow } from '../TableView/useGridWindow';
import { DOCUMENT_ROW_HEIGHT, DocumentTreeRow } from './DocumentTree';

const NO_COLUMNS = [0];
const NO_TOGGLES: ReadonlySet<string> = new Set();
// A panel shows at most this many rows before it scrolls, so several results fit one view.
const PANEL_MAX_ROWS = 14;

interface DocumentResultsViewProps {
  results: DocumentCommandResult[];
  /** The text that was run, which error positions refer to. */
  runText: string;
  isLoading: boolean;
  exportName: string;
  onJump: (position: QueryErrorPosition) => void;
}

const noop = () => {};

function ReadOnlyTree({ result }: { result: DocumentCommandResult }) {
  const portRef = useRef<HTMLDivElement>(null);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(NO_TOGGLES);
  const documents = useMemo(() => resultDocuments(result), [result]);
  const rows = useMemo(() => flattenTree(documents, toggled), [documents, toggled]);
  const range = useGridWindow({
    portRef,
    rowCount: rows.length,
    offsets: NO_COLUMNS,
    leadingWidth: 0,
    rowHeight: DOCUMENT_ROW_HEIGHT,
    headerHeight: 0,
  });

  const toggle = (row: TreeRow) => {
    const key = treeKey(row.docIndex, row.path);
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const start = Math.min(range.rowStart, rows.length);
  const end = Math.min(range.rowEnd, rows.length);
  return (
    <div
      ref={portRef}
      role="tree"
      aria-label={`Result of ${result.command}`}
      className="overflow-auto"
      style={{ maxHeight: PANEL_MAX_ROWS * DOCUMENT_ROW_HEIGHT }}
    >
      <div style={{ height: rows.length * DOCUMENT_ROW_HEIGHT }}>
        <div style={{ height: start * DOCUMENT_ROW_HEIGHT }} />
        {rows.slice(start, end).map((row) => (
          <DocumentTreeRow
            key={treeKey(row.docIndex, row.path)}
            row={row}
            selected={false}
            active={false}
            onToggle={toggle}
            onSelect={noop}
            onActivate={noop}
            onContextMenu={noop}
            onCommitEdit={() => null}
            onCancelEdit={noop}
            onSave={noop}
            onDiscard={noop}
          />
        ))}
      </div>
    </div>
  );
}

async function exportResult(result: DocumentCommandResult, name: string) {
  try {
    const path = await exportSaveFile(resultExportFile(result, name));
    if (!path) return;
    toast.success(`Saved to ${path}`, 8000, {
      label: 'Show in folder',
      run: () => {
        exportReveal(path).catch((error: unknown) =>
          toast.error(`Could not open the folder: ${invokeErrorMessage(error, 'unknown error')}`),
        );
      },
    });
  } catch (error) {
    toast.error(`Could not export the result: ${invokeErrorMessage(error, 'unknown error')}`);
  }
}

export function DocumentResultsView({ results, runText, isLoading, exportName, onJump }: DocumentResultsViewProps) {
  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        {isLoading ? 'Running…' : 'Run a command to see its result here.'}
      </div>
    );
  }
  return (
    <div className={`h-full overflow-y-auto p-3 space-y-3 ${isLoading ? 'opacity-60' : ''}`}>
      {results.map((result) => {
        const exportable = !result.error && (result.documents?.length ?? 0) + (result.value ? 1 : 0) > 0;
        const hasBody = Boolean(result.documents?.length || result.value);
        return (
          <section key={result.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-[11px]">
              <code className="min-w-0 flex-1 truncate font-mono text-foreground" title={result.command}>
                {result.command}
              </code>
              {!result.error && (
                <span className="shrink-0 text-muted-foreground">{resultSummary(result).join(' · ')}</span>
              )}
              {exportable && (
                <button
                  type="button"
                  onClick={() => void exportResult(result, exportName)}
                  title="Export the result as a JSON array"
                  className="pressable shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted hover:bg-accent border border-border text-foreground"
                >
                  <Download className="w-3 h-3" />
                  Export JSON
                </button>
              )}
            </header>
            {result.error ? (
              <div className="p-3">
                <QueryErrorCard
                  onJump={onJump}
                  fallbackHeading="Command failed"
                  result={{
                    id: result.id,
                    query: runText,
                    timestamp: result.timestamp,
                    executionTimeMs: result.executionTimeMs,
                    error: result.error,
                    errorInfo: result.errorInfo ?? undefined,
                  }}
                />
              </div>
            ) : hasBody ? (
              <ReadOnlyTree result={result} />
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {result.documents ? 'No documents.' : 'Done.'}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
