import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ListTree, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { DocumentCapabilities } from '@db/database';
import type { IndexDraft } from '@db/shared';
import { indexDraftSummary, validateIndexDraft } from '../../lib/document/indexDraft';
import { Checkbox } from '../ui/Checkbox';
import { Drawer, DrawerPanel } from '../ui/Drawer';
import { ErrorNotice } from '../ui/ErrorNotice';
import { OverlayPresence } from '../ui/OverlayPresence';
import { Select } from '../ui/Select';

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1';

interface KeyKind {
  value: string;
  label: string;
}

interface DocumentIndexDrawerProps {
  isOpen: boolean;
  namespace: string;
  capabilities: DocumentCapabilities;
  keyKinds: KeyKind[];
  /** Resolves to the server's error, or `null` once the index exists. */
  onCreate: (draft: IndexDraft) => Promise<string | null>;
  onClose: () => void;
}

const EMPTY: IndexDraft = {
  name: '',
  keys: [['', '1']],
  unique: false,
  sparse: false,
  hidden: false,
  ttlSeconds: null,
  partialFilter: '',
};

function kindAllowed(kind: string, caps: DocumentCapabilities): boolean {
  if (kind === 'text') return caps.textIndexes;
  if (kind === '2dsphere') return caps.geoIndexes;
  if (kind === 'hashed') return caps.hashedIndexes;
  return true;
}

function CheckRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={label} />
      <span className="font-mono">{label}</span>
    </label>
  );
}

function Body({ namespace, capabilities, keyKinds, onCreate, onClose }: DocumentIndexDrawerProps) {
  const [draft, setDraft] = useState<IndexDraft>(EMPTY);
  const [ttlText, setTtlText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const kinds = useMemo(
    () => keyKinds.filter((kind) => kindAllowed(kind.value, capabilities)),
    [keyKinds, capabilities],
  );

  // An empty TTL box means no TTL; anything else is parsed so a decimal or negative reaches validation.
  const effective = useMemo<IndexDraft>(
    () => ({ ...draft, ttlSeconds: ttlText.trim() === '' ? null : Number(ttlText) }),
    [draft, ttlText],
  );
  const errors = useMemo(() => validateIndexDraft(effective, capabilities), [effective, capabilities]);

  const patch = (next: Partial<IndexDraft>) => setDraft((prev) => ({ ...prev, ...next }));
  const setKey = (index: number, key: [string, string]) =>
    patch({ keys: draft.keys.map((existing, i) => (i === index ? key : existing)) });

  const submit = async () => {
    if (busy || errors.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const name = effective.name?.trim();
      const result = await onCreate({
        ...effective,
        name: name ? name : null,
        keys: effective.keys.map(([field, kind]) => [field.trim(), kind]),
      });
      setError(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer onScrimClick={busy ? undefined : onClose}>
      <DrawerPanel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-index-title"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-popover border-l border-border shadow-2xl flex flex-col font-sans text-popover-foreground outline-none"
      >
        <header className="px-4 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListTree className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div id="document-index-title" className="font-mono text-xs font-bold text-foreground">
                New index
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">{namespace}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close new index"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {error && (
          <div className="border-b bg-rose-500/10 border-rose-500/20 px-4 py-2">
            <ErrorNotice message={error} className="text-[11px] font-mono text-rose-300" />
          </div>
        )}

        <form
          id="document-index-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex-1 min-h-0 overflow-auto p-4 space-y-4"
        >
          <div>
            <label htmlFor="document-index-name" className={labelClass}>
              Name
            </label>
            <input
              id="document-index-name"
              value={draft.name ?? ''}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Generated from the keys"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <span className={labelClass}>Keys</span>
            {draft.keys.map(([field, kind], index) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  value={field}
                  onChange={(event) => setKey(index, [event.target.value, kind])}
                  placeholder="field.path"
                  aria-label={`Key ${index + 1} field`}
                  autoFocus={index === 0}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
                <Select
                  className="w-36 shrink-0"
                  value={kind}
                  options={kinds}
                  onChange={(value) => setKey(index, [field, value])}
                  aria-label={`Key ${index + 1} kind`}
                />
                <button
                  type="button"
                  onClick={() => patch({ keys: draft.keys.filter((_, i) => i !== index) })}
                  disabled={draft.keys.length === 1}
                  aria-label={`Remove key ${index + 1}`}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch({ keys: [...draft.keys, ['', '1']] })}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" /> Add key
            </button>
          </div>

          <div className="space-y-2">
            <span className={labelClass}>Options</span>
            <CheckRow checked={draft.unique} label="Unique" onChange={(unique) => patch({ unique })} />
            <CheckRow checked={draft.sparse} label="Sparse" onChange={(sparse) => patch({ sparse })} />
            {capabilities.hiddenIndexes && (
              <CheckRow checked={draft.hidden} label="Hidden" onChange={(hidden) => patch({ hidden })} />
            )}
          </div>

          {capabilities.ttlIndexes && (
            <div>
              <label htmlFor="document-index-ttl" className={labelClass}>
                Expire after (seconds)
              </label>
              <input
                id="document-index-ttl"
                value={ttlText}
                onChange={(event) => setTtlText(event.target.value)}
                placeholder="No expiry"
                inputMode="numeric"
                autoComplete="off"
                className={inputClass}
              />
            </div>
          )}

          {capabilities.partialIndexes && (
            <div>
              <label htmlFor="document-index-partial" className={labelClass}>
                Partial filter
              </label>
              <textarea
                id="document-index-partial"
                value={draft.partialFilter}
                onChange={(event) => patch({ partialFilter: event.target.value })}
                placeholder="{ status: 'active' }"
                rows={3}
                spellCheck={false}
                className={inputClass}
              />
            </div>
          )}

          {errors.length > 0 && (
            <ul className="space-y-1 text-[11px] text-amber-400" aria-label="Problems">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </form>

        <footer className="px-4 py-3 border-t border-border bg-background/60 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono truncate min-w-0">
            {errors.length === 0 ? indexDraftSummary(effective) : ''}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-background hover:bg-accent text-foreground border border-border text-xs font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="document-index-form"
              disabled={busy || errors.length > 0}
              className="pressable flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Create index</span>
            </button>
          </div>
        </footer>
      </DrawerPanel>
    </Drawer>
  );
}

export function DocumentIndexDrawer(props: DocumentIndexDrawerProps) {
  return (
    <OverlayPresence isOpen={props.isOpen}>
      <Body {...props} />
    </OverlayPresence>
  );
}
