import { AlertCircle } from 'lucide-react';
import { categoryLabel, errorExcerpt, errorFacts, queryErrorCopyText } from '../../lib/queryError';
import { queryErrorText } from '../../lib/sqlQuery';
import type { QueryErrorPosition, QueryExecutionResult } from '../../types';
import { CopyButton } from '../ui/CopyButton';

interface QueryErrorCardProps {
  result: QueryExecutionResult;
  /** Makes the line and column a button that moves the editor caret there. */
  onJump?: (position: QueryErrorPosition) => void;
  /** Heading when the error has no structured category. */
  fallbackHeading?: string;
}

/** What the database said went wrong with a query, and where. */
export function QueryErrorCard({ result, onJump, fallbackHeading = 'SQL Execution Error' }: QueryErrorCardProps) {
  const info = result.errorInfo;
  const excerpt = info ? errorExcerpt(result.query, info.position) : null;
  const facts = info ? errorFacts(info) : [];

  return (
    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 space-y-3 font-mono text-xs shadow-lg select-text">
      <div className="flex items-center gap-2 font-bold text-red-400">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{info ? categoryLabel(info.category) : fallbackHeading}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {(info?.code || info?.vendorCode != null) && (
            <span className="text-[11px] font-normal text-red-400/80">
              {[info?.code, info?.vendorCode != null ? String(info.vendorCode) : undefined]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <CopyButton text={queryErrorCopyText(result)} label="Copy error" />
        </span>
      </div>

      <p className="bg-background p-3 rounded-lg border border-red-500/30 leading-relaxed text-red-400 whitespace-pre-wrap break-words">
        {info ? info.message : queryErrorText(result.error)}
      </p>

      {info?.position && excerpt && (
        <div className="space-y-1.5">
          {(() => {
            const position = info.position;
            const label = `Line ${position.line}${position.column != null ? `, column ${position.column}` : ''}`;
            return onJump ? (
              <button
                type="button"
                onClick={() => onJump(position)}
                title="Go to this position in the editor"
                className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
              >
                {label}
              </button>
            ) : (
              <div className="text-[11px] text-muted-foreground">{label}</div>
            );
          })()}
          <pre className="bg-background p-3 rounded-lg border border-red-500/30 overflow-x-auto leading-relaxed">
            <span className="text-muted-foreground select-none">{excerpt.lineNumber} │ </span>
            {excerpt.text}
            {'\n'}
            <span className="select-none">
              {' '.repeat(String(excerpt.lineNumber).length + 3 + excerpt.caretColumn - 1)}^
            </span>
          </pre>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="text-red-400 break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {info?.hint && (
        <div className="bg-background p-3 rounded-lg border border-red-500/30 leading-relaxed">
          <span className="text-muted-foreground">Hint </span>
          {info.hint}
        </div>
      )}

      <div className="pt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          Query failed in {result.executionTimeMs}ms
        </span>
      </div>
    </div>
  );
}
