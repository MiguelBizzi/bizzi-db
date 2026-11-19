import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Clock, Eye, Layers } from 'lucide-react';
import type { CollectionSchema } from '../../types';
import { collectionCountLabel } from '../../lib/document/explorer';
import { ContextMenu } from '../ui/ContextMenu';
import { RowMenuButton } from '../ui/RowMenuButton';
import { collectionMenuItems, type CollectionMenuHandlers } from '../tableManagementMenu';

interface CollectionListProps {
  collections: CollectionSchema[];
  activeId?: string;
  showDatabase: boolean;
  disabled: boolean;
  handlers: CollectionMenuHandlers;
}

const KIND_LABEL = { collection: '', view: 'VIEW', timeseries: 'TIME SERIES' } as const;

function KindIcon({ kind }: { kind: CollectionSchema['kind'] }) {
  if (kind === 'view') return <Eye className="w-4 h-4 shrink-0 text-amber-400" />;
  if (kind === 'timeseries') return <Clock className="w-4 h-4 shrink-0 text-sky-400" />;
  return <Layers className="w-4 h-4 shrink-0 text-primary" />;
}

export const CollectionList: React.FC<CollectionListProps> = ({
  collections,
  activeId,
  showDatabase,
  disabled,
  handlers,
}) => {
  const [menu, setMenu] = useState<{ x: number; y: number; collection: CollectionSchema } | null>(
    null,
  );

  return (
    <>
      {collections.map((collection) => {
        const isActive = collection.id === activeId;
        const badge = KIND_LABEL[collection.kind];
        return (
          <div
            key={collection.id}
            title={collection.id}
            className={`group relative rounded-lg border transition-all ${
              isActive
                ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                : 'bg-card/40 border-sidebar-border hover:bg-accent/60 text-card-foreground'
            }`}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, collection });
            }}
          >
            <div
              onClick={() => handlers.onOpen(collection)}
              className="p-2 pr-8 cursor-pointer flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <KindIcon kind={collection.kind} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-medium truncate text-foreground">
                      {collection.name}
                    </span>
                    {badge && (
                      <span className="text-[9px] px-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                        {badge}
                      </span>
                    )}
                  </div>
                  {showDatabase && (
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {collection.database}
                    </div>
                  )}
                </div>
              </div>
              <span
                className="shrink-0 text-[10px] font-mono px-1.5 rounded bg-muted text-muted-foreground"
                aria-label={`Documents: ${collectionCountLabel(collection)}`}
              >
                {collectionCountLabel(collection)}
              </span>
            </div>
            <RowMenuButton
              label={`Collection actions for ${collection.name}`}
              open={menu?.collection.id === collection.id}
              onOpen={(x, y) => setMenu({ x, y, collection })}
              onClose={() => setMenu(null)}
            />
          </div>
        );
      })}
      <AnimatePresence>
        {menu && (
          <ContextMenu
            key={`${menu.x}:${menu.y}`}
            x={menu.x}
            y={menu.y}
            items={collectionMenuItems(menu.collection, handlers, { disabled })}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
