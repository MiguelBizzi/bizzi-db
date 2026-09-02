import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Plug,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { ConnectionFolder, ConnectionProfile } from '../types';
import { PostgresLogo } from './icons/PostgresLogo';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';
import {
  type ConnectionDropTarget,
  dropTargetFromRects,
  filterConnectionTree,
  folderDeleteCopy,
  folderDeleteNeedsPrompt,
  groupConnections,
  isNoOpConnectionDrop,
} from '../lib/connectionFolders';
import {
  connectionPointerUpKind,
  shouldActivateConnectionDrag,
} from '../lib/connectionDrag';

interface ConnectionPickerProps {
  ready: boolean;
  profiles: ConnectionProfile[];
  folders: ConnectionFolder[];
  connectingId: string | null;
  connectError: string | null;
  loadError: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (profile: ConnectionProfile) => void;
  onNewConnection: (folderId?: string | null) => void;
  onCreateFolder: (name: string) => Promise<ConnectionFolder>;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string, deleteConnections: boolean) => void;
  onMoveConnection: (
    id: string,
    folderId: string | null,
    beforeId?: string | null
  ) => void;
}

function envBadge(env: string) {
  switch (env) {
    case 'production':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'staging':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    default:
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  }
}

type FolderDeleteState =
  | { id: string; step: 'choose'; count: number }
  | { id: string; step: 'confirm-remove'; count: number };

type DragSession = {
  id: string;
  folderId: string | null;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

function idsInList(
  tree: ReturnType<typeof groupConnections>,
  folderId: string | null
): string[] {
  if (!folderId) return tree.ungrouped.map((profile) => profile.id);
  return (
    tree.folders.find((group) => group.folder.id === folderId)?.profiles.map((profile) => profile.id) ??
    []
  );
}

function ConnectionDropSkeleton() {
  return (
    <li aria-hidden className="pointer-events-none">
      <div className="w-full rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3.5 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-muted border border-border shrink-0">
          <span className="block h-4 w-4 rounded bg-muted-foreground/20" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <span className="block h-3 w-28 rounded bg-muted-foreground/20" />
          <span className="block h-2.5 w-44 max-w-full rounded bg-muted-foreground/20" />
        </div>
      </div>
    </li>
  );
}

export const ConnectionPicker: React.FC<ConnectionPickerProps> = ({
  ready,
  profiles,
  folders,
  connectingId,
  connectError,
  loadError,
  onSelect,
  onDelete,
  onEdit,
  onNewConnection,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveConnection,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [folderDelete, setFolderDelete] = useState<FolderDeleteState | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<ConnectionDropTarget | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; profile: ConnectionProfile } | null>(
    null
  );
  const dragRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const busy = connectingId !== null;
  const searching = query.trim().length > 0;

  const tree = useMemo(
    () => filterConnectionTree(groupConnections(folders, profiles), query),
    [folders, profiles, query]
  );
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const hasItems = profiles.length > 0 || folders.length > 0;

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) onRenameFolder(renamingId, name);
    setRenamingId(null);
  };

  const startRename = (folder: ConnectionFolder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
    setFolderDelete(null);
  };

  const handleCreateFolder = async () => {
    const created = await onCreateFolder('New folder');
    setRenamingId(created.id);
    setRenameValue(created.name);
  };

  const requestDeleteFolder = (folderId: string, count: number) => {
    if (!folderDeleteNeedsPrompt(count)) {
      onDeleteFolder(folderId, false);
      return;
    }
    setFolderDelete({ id: folderId, step: 'choose', count });
  };

  const resolveDrop = (x: number, y: number, draggedId: string): ConnectionDropTarget | null => {
    const stack = document.elementsFromPoint(x, y);
    const list = stack
      .map((node) => node.closest('[data-drop-folder]'))
      .find((node): node is Element => Boolean(node));
    if (!list) return null;
    const attr = list.getAttribute('data-drop-folder');
    const folderId = !attr || attr === 'root' ? null : attr;
    const items = [...list.querySelectorAll('[data-connection-id]')].flatMap((node) => {
      const id = node.getAttribute('data-connection-id');
      if (!id || id === draggedId) return [];
      const rect = node.getBoundingClientRect();
      return [{ id, top: rect.top, bottom: rect.bottom }];
    });
    return dropTargetFromRects(folderId, items, y);
  };

  const clearDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDropHint(null);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    profile: ConnectionProfile
  ) => {
    if (busy || searching || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    dragRef.current = {
      id: profile.id,
      folderId: profile.folderId ?? null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.active) {
      if (
        !shouldActivateConnectionDrag(
          session.startX,
          session.startY,
          event.clientX,
          event.clientY
        )
      ) {
        return;
      }
      session.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggingId(session.id);
    }
    const next = resolveDrop(event.clientX, event.clientY, session.id);
    setDropHint((prev) =>
      prev?.folderId === next?.folderId && prev?.beforeId === next?.beforeId ? prev : next
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const kind = connectionPointerUpKind(session.active);
    suppressClickRef.current = true;
    if (kind === 'drop') {
      const target = resolveDrop(event.clientX, event.clientY, session.id);
      const siblings = idsInList(treeRef.current, session.folderId);
      if (
        target &&
        !isNoOpConnectionDrop(session.id, session.folderId, siblings, target)
      ) {
        onMoveConnection(session.id, target.folderId, target.beforeId);
      }
    } else {
      onSelect(session.id);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearDrag();
  };

  const menuItems = (profile: ConnectionProfile): ContextMenuItem[] => [
    {
      id: 'move',
      label: 'Move to',
      submenu: [
        {
          id: 'root',
          label: 'Ungrouped',
          disabled: !profile.folderId,
          onSelect: () => onMoveConnection(profile.id, null),
        },
        ...folders.map((folder) => ({
          id: folder.id,
          label: folder.name,
          disabled: profile.folderId === folder.id,
          onSelect: () => onMoveConnection(profile.id, folder.id),
        })),
      ],
    },
  ];

  const showDropLine = (folderId: string | null, beforeId: string | null) =>
    Boolean(
      draggingId &&
        dropHint &&
        dropHint.folderId === folderId &&
        dropHint.beforeId === beforeId
    );

  const renderConnection = (profile: ConnectionProfile, folderId: string | null) => {
    const isConnecting = connectingId === profile.id;
    const confirming = pendingDeleteId === profile.id;
    const isDragging = draggingId === profile.id;
    return (
      <Fragment key={profile.id}>
        {showDropLine(folderId, profile.id) && <ConnectionDropSkeleton />}
        <li>
          <div
            data-connection-id={profile.id}
            onPointerDown={(event) => handlePointerDown(event, profile)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={clearDrag}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, profile });
            }}
            className={`w-full rounded-2xl border bg-card text-left transition-colors touch-none ${
              isDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
            } ${
              isConnecting
                ? 'border-primary/40'
                : 'border-border hover:border-primary/40 hover:bg-accent/40'
            }`}
          >
          <div className="flex items-stretch">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelect(profile.id);
              }}
              className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3 text-left disabled:opacity-60"
            >
              <div className="p-2 rounded-xl bg-muted border border-border text-primary shrink-0">
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PostgresLogo className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{profile.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border font-mono ${envBadge(
                      profile.environment
                    )}`}
                  >
                    {profile.environment}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {profile.user}@{profile.host}:{profile.port}/{profile.database}
                </p>
              </div>
              {isConnecting && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                  <Plug className="w-3 h-3" />
                  Connecting…
                </span>
              )}
            </button>

            <div data-no-drag className="flex items-center pr-2">
              {confirming ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPendingDeleteId(null);
                      onDelete(profile.id);
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(null)}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    type="button"
                    disabled={busy}
                    title="Edit connection"
                    onClick={() => onEdit(profile)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    title="Delete connection"
                    onClick={() => setPendingDeleteId(profile.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </li>
      </Fragment>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a database to open, or add a new connection.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void handleCreateFolder();
              }}
              disabled={busy}
              title="New folder"
              aria-label="New folder"
              className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-card text-foreground hover:bg-accent disabled:opacity-50"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNewConnection()}
              disabled={busy}
              title="New connection"
              aria-label="New connection"
              className="inline-flex items-center justify-center size-8 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(loadError || connectError) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2.5 text-sm">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{connectError || loadError}</span>
          </div>
        )}

        {!ready ? (
          <div className="rounded-2xl border border-border bg-card px-8 py-16 text-center text-sm text-muted-foreground">
            Loading connections…
          </div>
        ) : !hasItems ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-8 py-16 flex flex-col items-center text-center">
            <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-4">
              <Database className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold">No connections yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Save a PostgreSQL connection to inspect schema, preview tables, and run SQL.
            </p>
            <button
              type="button"
              onClick={() => onNewConnection()}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add connection
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-card text-sm">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search connections and folders"
                className="flex-1 min-w-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              />
            </label>

            {searching && tree.ungrouped.length === 0 && tree.folders.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">No matching connections.</p>
            ) : (
              <div className="space-y-4">
                {(folders.length > 0 || tree.ungrouped.length > 0) && (
                  <section
                    data-drop-folder="root"
                    className={`rounded-2xl ${
                      draggingId && dropHint?.folderId === null
                        ? 'ring-2 ring-primary/40'
                        : ''
                    }`}
                  >
                    {folders.length > 0 && (
                      <div className="flex items-center justify-between px-1 pb-2">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Ungrouped
                          <span className="ml-1.5 font-mono">({tree.ungrouped.length})</span>
                        </h2>
                      </div>
                    )}
                    {tree.ungrouped.length > 0 ? (
                      <ul className="space-y-2">
                        {tree.ungrouped.map((profile) => renderConnection(profile, null))}
                        {showDropLine(null, null) && <ConnectionDropSkeleton />}
                      </ul>
                    ) : folders.length > 0 ? (
                      showDropLine(null, null) ? (
                        <ul className="space-y-2">
                          <ConnectionDropSkeleton />
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground px-1 pb-1">
                          Drag connections here to ungroup them.
                        </p>
                      )
                    ) : null}
                  </section>
                )}

                {tree.folders.map((group) => {
                  const expanded = searching || !collapsed[group.folder.id];
                  const deleting = folderDelete?.id === group.folder.id ? folderDelete : null;
                  const copy = folderDeleteCopy(group.profiles.length);
                  return (
                    <section
                      key={group.folder.id}
                      data-drop-folder={group.folder.id}
                      className={`rounded-2xl border bg-card ${
                        draggingId && dropHint?.folderId === group.folder.id
                          ? 'border-primary/50 ring-2 ring-primary/30'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-1 px-2 py-2">
                        <button
                          type="button"
                          className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-xl text-left hover:bg-accent/60"
                          onClick={() => {
                            if (renamingId === group.folder.id) return;
                            setCollapsed((current) => ({
                              ...current,
                              [group.folder.id]: !current[group.folder.id],
                            }));
                          }}
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          {renamingId === group.folder.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitRename();
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  setRenamingId(null);
                                }
                              }}
                              onBlur={commitRename}
                              className="flex-1 min-w-0 h-7 px-2 rounded-lg border border-primary bg-background text-sm font-semibold text-foreground outline-none focus:outline-none focus:border-primary focus:ring-0"
                            />
                          ) : (
                            <>
                              <span className="text-sm font-semibold truncate">
                                {group.folder.name}
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {group.profiles.length}
                              </span>
                            </>
                          )}
                        </button>
                        {deleting ? (
                          <div className="flex items-center gap-1 pr-1">
                            {deleting.step === 'choose' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setFolderDelete(null);
                                    onDeleteFolder(group.folder.id, false);
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold hover:bg-accent"
                                >
                                  {copy.keep}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    setFolderDelete({
                                      id: group.folder.id,
                                      step: 'confirm-remove',
                                      count: group.profiles.length,
                                    })
                                  }
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25"
                                >
                                  {copy.remove}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFolderDelete(null)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-accent"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-[11px] text-muted-foreground max-w-36 truncate">
                                  {copy.confirmRemove}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setFolderDelete(null);
                                    onDeleteFolder(group.folder.id, true);
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFolderDelete(null)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-accent"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <button
                              type="button"
                              disabled={busy}
                              title="Add connection to folder"
                              onClick={() => onNewConnection(group.folder.id)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              title="Rename folder"
                              onClick={() => startRename(group.folder)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              title="Delete folder"
                              onClick={() =>
                                requestDeleteFolder(group.folder.id, group.profiles.length)
                              }
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {expanded && (
                        <ul className="space-y-2 px-2 pb-2">
                          {group.profiles.length > 0 ? (
                            <>
                              {group.profiles.map((profile) =>
                                renderConnection(profile, group.folder.id)
                              )}
                              {showDropLine(group.folder.id, null) && (
                                <ConnectionDropSkeleton />
                              )}
                            </>
                          ) : showDropLine(group.folder.id, null) ? (
                            <ConnectionDropSkeleton />
                          ) : (
                            <li className="px-3 py-2 text-xs text-muted-foreground">
                              Drop connections here
                            </li>
                          )}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.profile)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};
