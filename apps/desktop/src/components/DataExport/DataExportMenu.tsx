import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence } from 'motion/react';
import { Popover } from '../ui/Popover';
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
  COPY_CSV_SHORTCUT,
  DATA_EXPORT_FORMATS,
  DataExportFormat,
  DataExportInput,
  downloadExport,
  formatExport,
  writeClipboard,
} from '../../lib/dataExport';
import { invokeErrorMessage } from '../../lib/invokeError';
import { dismissToast, toast } from '../../lib/toast';

export const FORMAT_ICONS: Record<
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
  /**
   * Fetches every row when `rows` is only the loaded page. Leave unset to export
   * `rows` as given (a row selection, or data that is already complete).
   */
  loadAllRows?: () => Promise<Record<string, unknown>[]>;
  /**
   * Receives the Export menu's default action (download as CSV) while this menu is mounted, so
   * the menu bar's Export command runs the same export. It does nothing while the menu is idle.
   */
  exportTriggerRef?: RefObject<(() => void) | null>;
}

type OpenMenu = 'copy' | 'export' | null;

/** The all-rows fetch failed, as opposed to the clipboard or download. */
class LoadRowsError extends Error {
  constructor(cause: unknown) {
    super('Could not load all rows', { cause });
  }
}

export function DataExportMenu({
  columns,
  rows,
  tableName,
  schema,
  disabled = false,
  disabledReason,
  loadAllRows,
  exportTriggerRef,
}: DataExportMenuProps) {
  const [open, setOpen] = useState<OpenMenu>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'copy' | 'export' | null>(null);
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
  const loadAllRef = useRef(loadAllRows);
  loadAllRef.current = loadAllRows;
  const busyRef = useRef(false);

  useEffect(() => {
    if (idle) setOpen(null);
  }, [idle]);

  /** The rows to export: every row when a loader is set, else what the grid holds. */
  const resolveInput = async (): Promise<DataExportInput> => {
    const loadAll = loadAllRef.current;
    if (!loadAll) return inputRef.current;
    return { ...inputRef.current, rows: await loadAll() };
  };

  // Not awaiting anything before the clipboard write starts keeps it inside the
  // click that asked for it; the rows are handed over as a promise.
  const runExport = async (kind: 'copy' | 'export', format: DataExportFormat) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(kind);
    setOpen(null);
    const progress = loadAllRef.current ? toast.loading('Loading all rows…') : null;
    let loadFailed = false;
    const data = resolveInput().catch((error: unknown) => {
      loadFailed = true;
      throw error;
    });
    data.catch(() => {});
    try {
      if (kind === 'copy') {
        await writeClipboard(data.then((input) => formatExport(input, format)));
      } else {
        downloadExport(await data, format);
      }
      return true;
    } catch (error) {
      const reason = invokeErrorMessage(error, 'unknown error');
      if (loadFailed) toast.error(`Could not load all rows: ${reason}`);
      else if (kind === 'copy') toast.error(`Could not copy to the clipboard: ${reason}`);
      else toast.error(`Could not export the rows: ${reason}`);
      return false;
    } finally {
      if (progress) dismissToast(progress);
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleCopy = async (format: DataExportFormat) => {
    if (!(await runExport('copy', format))) return;
    setCopied(true);
    const label = DATA_EXPORT_FORMATS.find((item) => item.id === format)?.label ?? format;
    toast(`Copied as ${label}`);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleExport = (format: DataExportFormat) => runExport('export', format);

  useEffect(() => {
    if (!exportTriggerRef) return;
    const trigger = () => {
      if (!idle) void handleExport('csv');
    };
    exportTriggerRef.current = trigger;
    return () => {
      if (exportTriggerRef.current === trigger) exportTriggerRef.current = null;
    };
  });

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
        label={busy === 'copy' ? 'Copying…' : copied ? 'Copied' : 'Copy'}
        icon={copied && !busy ? Check : Copy}
        iconClass={copied && !busy ? 'text-emerald-400' : undefined}
        title={idle ? idleReason : `Copy (${COPY_CSV_SHORTCUT} for CSV)`}
        open={open === 'copy'}
        disabled={idle || busy !== null}
        onToggle={() => setOpen(open === 'copy' ? null : 'copy')}
        onSelect={handleCopy}
      />
      <FormatDropdown
        label={busy === 'export' ? 'Exporting…' : 'Export'}
        icon={Download}
        title={idle ? idleReason : 'Download as a file'}
        open={open === 'export'}
        disabled={idle || busy !== null}
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
        className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border hover:bg-accent text-foreground text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background"
      >
        <Icon className={`w-3.5 h-3.5 ${iconClass ?? ''}`} />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      <AnimatePresence>
      {open && (
        <Popover origin="top" className="absolute right-0 mt-1 min-w-34 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-40 text-xs text-popover-foreground">
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
        </Popover>
      )}
      </AnimatePresence>
    </div>
  );
}
