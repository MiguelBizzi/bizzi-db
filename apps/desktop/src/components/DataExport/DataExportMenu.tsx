import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Code,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import {
  copyExport,
  COPY_CSV_SHORTCUT,
  DATA_EXPORT_FORMATS,
  DataExportFormat,
  DataExportInput,
  downloadExport,
} from '../../lib/dataExport';

const FORMAT_ICONS: Record<
  DataExportFormat,
  { icon: typeof FileSpreadsheet; className: string }
> = {
  csv: { icon: FileSpreadsheet, className: 'text-emerald-400' },
  json: { icon: FileText, className: 'text-primary' },
  markdown: { icon: FileText, className: 'text-muted-foreground' },
  sql: { icon: Code, className: 'text-amber-400' },
};

interface DataExportMenuProps {
  columns: string[];
  rows: Record<string, unknown>[];
  tableName?: string;
  schema?: string;
  disabled?: boolean;
  disabledReason?: string;
}

type OpenMenu = 'copy' | 'export' | null;

export function DataExportMenu({
  columns,
  rows,
  tableName,
  schema,
  disabled = false,
  disabledReason,
}: DataExportMenuProps) {
  const [open, setOpen] = useState<OpenMenu>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const input: DataExportInput = { columns, rows, tableName, schema };
  const empty = columns.length === 0 || rows.length === 0;
  const idle = disabled || empty;
  const idleReason = disabled
    ? (disabledReason ?? 'Unavailable while table data is loading')
    : empty
      ? 'No rows to copy or export'
      : undefined;
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (idle) setOpen(null);
  }, [idle]);

  const handleCopy = async (format: DataExportFormat) => {
    try {
      await copyExport(inputRef.current, format);
      setCopied(true);
      setOpen(null);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setOpen(null);
    }
  };

  const handleExport = (format: DataExportFormat) => {
    downloadExport(inputRef.current, format);
    setOpen(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (window.getSelection()?.toString()) return;
      if (idle) return;
      event.preventDefault();
      void handleCopy('csv');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idle]);

  return (
    <div ref={rootRef} className="flex items-center gap-2">
      <FormatDropdown
        label={copied ? 'Copied' : 'Copy'}
        icon={copied ? Check : Copy}
        iconClass={copied ? 'text-emerald-400' : undefined}
        title={idle ? idleReason : `Copy (${COPY_CSV_SHORTCUT} for CSV)`}
        open={open === 'copy'}
        disabled={idle}
        onToggle={() => setOpen(open === 'copy' ? null : 'copy')}
        onSelect={handleCopy}
      />
      <FormatDropdown
        label="Export"
        icon={Download}
        title={idle ? idleReason : 'Download as a file'}
        open={open === 'export'}
        disabled={idle}
        onToggle={() => setOpen(open === 'export' ? null : 'export')}
        onSelect={handleExport}
      />
    </div>
  );
}

function FormatDropdown({
  label,
  icon: Icon,
  iconClass,
  title,
  open,
  disabled,
  onToggle,
  onSelect,
}: {
  label: string;
  icon: typeof Copy;
  iconClass?: string;
  title?: string;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSelect: (format: DataExportFormat) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border hover:bg-accent text-foreground text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background"
      >
        <Icon className={`w-3.5 h-3.5 ${iconClass ?? ''}`} />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-34 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-40 text-xs text-popover-foreground">
          {DATA_EXPORT_FORMATS.map((format) => {
            const { icon: FormatIcon, className } = FORMAT_ICONS[format.id];
            return (
              <button
                key={format.id}
                type="button"
                onClick={() => onSelect(format.id)}
                className="w-full flex items-center justify-start gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground font-mono text-left"
              >
                <FormatIcon className={`w-3.5 h-3.5 shrink-0 ${className}`} />
                <span>{format.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
