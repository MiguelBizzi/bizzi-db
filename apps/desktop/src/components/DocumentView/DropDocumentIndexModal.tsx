import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { DocumentIndex } from '@db/shared';
import { Modal, ModalPanel } from '../ui/Modal';
import { OverlayPresence } from '../ui/OverlayPresence';

interface DropDocumentIndexModalProps {
  /** `null` while closed. */
  index: DocumentIndex | null;
  namespace: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function Body({
  index,
  namespace,
  busy,
  onClose,
  onConfirm,
}: DropDocumentIndexModalProps & { index: DocumentIndex }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <Modal onScrimClick={busy ? undefined : onClose}>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-index-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center gap-2 bg-background/60">
          <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
          <span id="drop-index-title" className="font-mono text-xs font-bold text-foreground truncate">
            Drop index
          </span>
        </header>
        <div className="p-4 space-y-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Drop index <span className="font-bold">{index.name}</span> from{' '}
              <span className="font-bold">{namespace}</span>? Queries that relied on it may slow down. This
              cannot be undone, and takes effect immediately.
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="pressable px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="pressable flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{busy ? 'Dropping…' : 'Drop index'}</span>
            </button>
          </div>
        </div>
      </ModalPanel>
    </Modal>
  );
}

export function DropDocumentIndexModal(props: DropDocumentIndexModalProps) {
  return (
    <OverlayPresence isOpen={props.index !== null}>
      {props.index && <Body {...props} index={props.index} />}
    </OverlayPresence>
  );
}
