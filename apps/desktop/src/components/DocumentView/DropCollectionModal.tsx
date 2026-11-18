import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { CollectionSchema } from '../../types';
import { canConfirmDelete } from '../../lib/schemaChange';
import { Modal, ModalPanel } from '../ui/Modal';
import { OverlayPresence } from '../ui/OverlayPresence';

interface DropCollectionModalProps {
  collection: CollectionSchema | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const Body: React.FC<DropCollectionModalProps> = ({ collection, busy, onClose, onConfirm }) => {
  const [typed, setTyped] = useState('');

  useEffect(() => setTyped(''), [collection?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  if (!collection) return null;
  const matched = canConfirmDelete(typed, collection.name) && !busy;
  const noun = collection.kind === 'view' ? 'view' : 'collection';

  return (
    <Modal>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-collection-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <span id="drop-collection-title" className="font-mono text-xs font-bold text-foreground truncate">
              Drop {noun}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close drop collection"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (matched) onConfirm();
          }}
          className="p-4 space-y-3"
        >
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-mono flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This cannot be undone. Dropping <span className="font-bold">{collection.id}</span>{' '}
              {collection.kind === 'view'
                ? 'removes the view; the collection it reads is not affected.'
                : 'permanently deletes the collection, its documents and its indexes.'}
            </span>
          </div>
          <div>
            <label
              htmlFor="confirm-drop-collection"
              className="block text-[10px] font-bold tracking-wide text-muted-foreground mb-1"
            >
              Type <span className="font-mono text-foreground normal-case">{collection.name}</span> to confirm
            </label>
            <input
              id="confirm-drop-collection"
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-3 py-2 bg-background border border-rose-500 rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground outline-none focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-inset focus:ring-rose-500"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="pressable px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matched}
              className="pressable flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{busy ? 'Dropping…' : `Drop ${noun}`}</span>
            </button>
          </div>
        </form>
      </ModalPanel>
    </Modal>
  );
};

export const DropCollectionModal: React.FC<DropCollectionModalProps> = (props) => (
  <OverlayPresence isOpen={props.collection != null}>
    <Body {...props} />
  </OverlayPresence>
);
