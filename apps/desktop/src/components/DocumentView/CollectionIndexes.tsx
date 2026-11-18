import { useEffect, useState } from 'react';
import { ListTree, Plus, Trash2 } from 'lucide-react';
import { collectionIndexCreate, collectionIndexDrop } from '@db/core';
import type { DocumentCapabilities } from '@db/database';
import type { CollectionSchema, DocumentIndex, IndexDraft } from '@db/shared';
import { invokeErrorMessage } from '../../lib/invokeError';
import { collectionIndexesManageable } from '../../lib/document/collectionView';
import { indexKeysLabel } from '../../lib/document/indexDraft';
import { shortcutLabel } from '../../lib/commands/shortcutLabel';
import { toast } from '../../lib/toast';
import { DocumentIndexDrawer } from './DocumentIndexDrawer';
import { DropDocumentIndexModal } from './DropDocumentIndexModal';

/** MongoDB's mandatory index on `_id`; the server refuses to drop it. */
const ID_INDEX = '_id_';

interface CollectionIndexesProps {
  connectionId: string;
  collection: CollectionSchema;
  capabilities: DocumentCapabilities;
  keyKinds: { value: string; label: string }[];
  /** Reloads the schema so this list and the sidebar show the change. */
  onSchemaChanged: () => void;
  /** Opens the new-index drawer, then reports it handled so a later remount does not reopen it. */
  createRequested: boolean;
  onCreateHandled: () => void;
  /** Reports whether the drawer or the drop confirmation is open, for the menu gate. */
  onOverlayChange: (open: boolean) => void;
}

function flagsOf(index: DocumentIndex): string[] {
  const flags: string[] = [];
  if (index.unique) flags.push('unique');
  if (index.sparse) flags.push('sparse');
  if (index.hidden) flags.push('hidden');
  if (index.ttlSeconds != null) flags.push(`TTL ${index.ttlSeconds}s`);
  if (index.partialFilter) flags.push(`partial ${index.partialFilter}`);
  return flags;
}

export function CollectionIndexes({
  connectionId,
  collection,
  capabilities,
  keyKinds,
  onSchemaChanged,
  createRequested,
  onCreateHandled,
  onOverlayChange,
}: CollectionIndexesProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toDrop, setToDrop] = useState<DocumentIndex | null>(null);
  const [dropping, setDropping] = useState(false);
  const ns = { database: collection.database, collection: collection.name };
  const manageable = collectionIndexesManageable(collection);

  useEffect(() => {
    if (!createRequested) return;
    if (manageable) setDrawerOpen(true);
    onCreateHandled();
  }, [createRequested, onCreateHandled, manageable]);

  const overlayOpen = drawerOpen || toDrop !== null;
  useEffect(() => {
    onOverlayChange(overlayOpen);
  }, [overlayOpen, onOverlayChange]);
  useEffect(() => () => onOverlayChange(false), [onOverlayChange]);

  const create = async (draft: IndexDraft): Promise<string | null> => {
    try {
      const name = await collectionIndexCreate(connectionId, ns, draft);
      setDrawerOpen(false);
      toast.success(`Created index ${name}`);
      onSchemaChanged();
      return null;
    } catch (error) {
      return invokeErrorMessage(error, 'Could not create the index');
    }
  };

  const confirmDrop = async () => {
    const index = toDrop;
    if (!index || dropping) return;
    setDropping(true);
    try {
      await collectionIndexDrop(connectionId, ns, index.name);
      setToDrop(null);
      toast.success(`Dropped index ${index.name}`);
      onSchemaChanged();
    } catch (error) {
      toast.error(invokeErrorMessage(error, 'Could not drop the index'));
    } finally {
      setDropping(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">
          {collection.indexes.length} {collection.indexes.length === 1 ? 'index' : 'indexes'}
        </span>
        {manageable && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title={shortcutLabel('file.newIndex')}
            className="pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background hover:bg-accent border border-border text-xs font-medium text-foreground"
          >
            <Plus className="w-3.5 h-3.5" /> New Index…
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {collection.indexes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No indexes.
          </div>
        ) : (
          <ul aria-label={`Indexes on ${collection.name}`} className="divide-y divide-border">
            {collection.indexes.map((index) => (
              <li key={index.name} className="px-3 py-2.5 flex items-start gap-3">
                <ListTree className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-semibold text-foreground truncate">{index.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">
                    {indexKeysLabel(index.keys)}
                  </div>
                  {flagsOf(index).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {flagsOf(index).map((flag) => (
                        <span
                          key={flag}
                          className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {manageable && index.name !== ID_INDEX && (
                  <button
                    type="button"
                    onClick={() => setToDrop(index)}
                    aria-label={`Drop index ${index.name}`}
                    title="Drop index"
                    className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DocumentIndexDrawer
        isOpen={drawerOpen}
        namespace={collection.id}
        capabilities={capabilities}
        keyKinds={keyKinds}
        onCreate={create}
        onClose={() => setDrawerOpen(false)}
      />
      <DropDocumentIndexModal
        index={toDrop}
        namespace={collection.id}
        busy={dropping}
        onClose={() => setToDrop(null)}
        onConfirm={() => void confirmDrop()}
      />
    </div>
  );
}
