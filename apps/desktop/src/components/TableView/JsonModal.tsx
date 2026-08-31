import React, { useState } from 'react';
import { X, Check, Copy, Code, AlertCircle } from 'lucide-react';

interface JsonModalProps {
  isOpen: boolean;
  columnName: string;
  initialValue: any;
  onSave: (val: any) => void;
  onClose: () => void;
}

export const JsonModal: React.FC<JsonModalProps> = ({
  isOpen,
  columnName,
  initialValue,
  onSave,
  onClose,
}) => {
  const formatJson = (val: any) => {
    try {
      if (typeof val === 'string') {
        return JSON.stringify(JSON.parse(val), null, 2);
      }
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val || '{}');
    }
  };

  const [jsonText, setJsonText] = useState(formatJson(initialValue));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onSave(parsed);
      onClose();
    } catch (e: any) {
      setError('Invalid JSON syntax: ' + e.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs font-bold text-foreground">
              JSON Inspector — {columnName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Textarea Code Body */}
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError(null);
            }}
            rows={12}
            className="w-full p-3 bg-background border border-border rounded-xl font-mono text-xs text-foreground focus:outline-none focus:border-primary resize-none leading-relaxed"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-background/60 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-mono border border-border transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-semibold shadow-md transition-colors"
            >
              Update Value
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
