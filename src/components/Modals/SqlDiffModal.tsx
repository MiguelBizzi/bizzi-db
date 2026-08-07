import React, { useState } from 'react';
import { X, Check, Code, Copy, AlertCircle } from 'lucide-react';
import { PendingModifications } from '../../types';

interface SqlDiffModalProps {
  isOpen: boolean;
  tableName: string;
  modifications: PendingModifications;
  onConfirmCommit: () => void;
  onClose: () => void;
}

export const SqlDiffModal: React.FC<SqlDiffModalProps> = ({
  isOpen,
  tableName,
  modifications,
  onConfirmCommit,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const sqlStatements: string[] = [];

  modifications.updates.forEach((u) => {
    sqlStatements.push(
      `UPDATE ${tableName} SET ${u.columnName} = '${u.newValue}' WHERE id = '${u.primaryKeyValue}'; -- Old: '${u.oldValue}'`
    );
  });

  modifications.inserts.forEach((i) => {
    const cols = Object.keys(i.data);
    const vals = Object.values(i.data).map((v) => `'${v}'`);
    sqlStatements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
  });

  modifications.deletes.forEach((d) => {
    sqlStatements.push(`DELETE FROM ${tableName} WHERE id = '${d.primaryKeyValue}';`);
  });

  const fullSqlText = sqlStatements.join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullSqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans select-none text-popover-foreground">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-xs font-bold text-foreground">
              Generated SQL DML Diff — {tableName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SQL Diff Code Area */}
        <div className="p-4 space-y-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-background border border-border space-y-2">
            <div className="text-[11px] font-bold uppercase text-amber-400 tracking-wider">
              Review DML Statements Before Executing:
            </div>
            <pre className="p-3 rounded-lg bg-card border border-border text-amber-400 overflow-x-auto leading-relaxed max-h-64 scrollbar-thin scrollbar-thumb-muted">
              {fullSqlText || '-- No pending modifications'}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-background/60 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-mono border border-border transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy DML Script'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirmCommit();
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-xs shadow transition-colors"
            >
              Confirm & Execute SQL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
