import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { validateCollectionName, validateDatabaseName } from '../../lib/document/collectionName';
import { ErrorNotice } from '../ui/ErrorNotice';
import { Modal, ModalPanel } from '../ui/Modal';
import { OverlayPresence } from '../ui/OverlayPresence';
import { Select, type SelectOption } from '../ui/Select';

// A database name cannot contain a null character, so this never collides with a real one.
const NEW_DATABASE = '\0new';

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1';

interface CreateCollectionModalProps {
  isOpen: boolean;
  /** Databases that already hold a collection. */
  databases: string[];
  /** Resolves to the server's error, or `null` once the collection exists. */
  onCreate: (database: string, collection: string) => Promise<string | null>;
  onClose: () => void;
}

function Body({ databases, onCreate, onClose }: CreateCollectionModalProps) {
  const [choice, setChoice] = useState(databases[0] ?? NEW_DATABASE);
  const [newDatabase, setNewDatabase] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const options = useMemo<SelectOption[]>(
    () => [
      ...databases.map((database) => ({ value: database, label: database })),
      { value: NEW_DATABASE, label: 'New database…' },
    ],
    [databases],
  );

  const creatingDatabase = choice === NEW_DATABASE;
  const database = creatingDatabase ? newDatabase : choice;
  const databaseError = creatingDatabase && newDatabase !== '' ? validateDatabaseName(newDatabase) : null;
  const nameError = name === '' ? null : validateCollectionName(name);
  const ready =
    validateDatabaseName(database) === null && validateCollectionName(name) === null && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      setError(await onCreate(database, name));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onScrimClick={busy ? undefined : onClose}>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-collection-title"
        className="w-full max-w-md bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-popover-foreground"
      >
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            <Plus className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span id="create-collection-title" className="font-mono text-xs font-bold text-foreground">
              New collection
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close new collection"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="p-4 space-y-3"
        >
          {error && <ErrorNotice message={error} className="text-[11px] font-mono text-rose-300" />}
          <div>
            <span className={labelClass}>Database</span>
            <Select
              value={choice}
              options={options}
              onChange={setChoice}
              aria-label="Database"
              searchable={databases.length > 8}
            />
            {creatingDatabase && (
              <input
                value={newDatabase}
                onChange={(event) => setNewDatabase(event.target.value)}
                placeholder="Database name"
                aria-label="New database name"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`${inputClass} mt-1.5`}
              />
            )}
            {databaseError && <p className="mt-1 text-[11px] text-amber-400">{databaseError}</p>}
          </div>
          <div>
            <label htmlFor="create-collection-name" className={labelClass}>
              Collection name
            </label>
            <input
              id="create-collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus={!creatingDatabase}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={inputClass}
            />
            {nameError && <p className="mt-1 text-[11px] text-amber-400">{nameError}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="pressable px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground text-xs transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!ready}
              className="pressable flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Create collection</span>
            </button>
          </div>
        </form>
      </ModalPanel>
    </Modal>
  );
}

export function CreateCollectionModal(props: CreateCollectionModalProps) {
  return (
    <OverlayPresence isOpen={props.isOpen}>
      <Body {...props} />
    </OverlayPresence>
  );
}
