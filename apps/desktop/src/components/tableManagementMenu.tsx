import type { ReactNode } from 'react';
import { Code, Copy, Edit3, Eraser, FilePlus2, ListTree, Table, Trash2 } from 'lucide-react';
import type { CollectionSchema, TableSchema } from '../types';
import { shortcutLabel } from '../lib/commands/shortcutLabel';
import { collectionIndexesManageable, collectionWritable } from '../lib/document/collectionView';
import {
  tableActionDescriptors,
  type TableActionId,
} from '../lib/tableActions';
import type { ContextMenuItem } from './ui/ContextMenu';

const ICONS: Record<TableActionId, ReactNode> = {
  open: <Table className="w-3.5 h-3.5" />,
  openSql: <Code className="w-3.5 h-3.5" />,
  edit: <Edit3 className="w-3.5 h-3.5" />,
  newIndex: <ListTree className="w-3.5 h-3.5" />,
  copySchema: <Copy className="w-3.5 h-3.5" />,
  empty: <Eraser className="w-3.5 h-3.5" />,
  delete: <Trash2 className="w-3.5 h-3.5" />,
};

export interface TableManagementHandlers {
  onOpen: (table: TableSchema) => void;
  onOpenSql: (table: TableSchema) => void;
  onEdit?: (table: TableSchema) => void;
  onNewIndex?: (table: TableSchema) => void;
  onCopySchema: (table: TableSchema) => void;
  onEmpty: (table: TableSchema) => void;
  onDelete: (table: TableSchema) => void;
}

export function tableManagementMenuItems(
  table: TableSchema,
  handlers: TableManagementHandlers,
  opts?: { hideEdit?: boolean }
): ContextMenuItem[] {
  return tableActionDescriptors({
    isView: table.isView,
    hideEdit: opts?.hideEdit,
  }).map((item) => {
    if (item.separator) {
      return { id: item.id, label: '', separator: true };
    }
    const id = item.id as TableActionId;
    const run = {
      open: handlers.onOpen,
      openSql: handlers.onOpenSql,
      edit: handlers.onEdit,
      newIndex: handlers.onNewIndex,
      copySchema: handlers.onCopySchema,
      empty: handlers.onEmpty,
      delete: handlers.onDelete,
    }[id];
    return {
      id,
      label: item.label ?? '',
      danger: item.danger,
      disabled: item.disabled || !run,
      icon: ICONS[id],
      onSelect: run ? () => run(table) : undefined,
    };
  });
}

export interface CollectionMenuHandlers {
  onOpen: (collection: CollectionSchema) => void;
  onInsertDocument: (collection: CollectionSchema) => void;
  onNewIndex: (collection: CollectionSchema) => void;
  onDrop: (collection: CollectionSchema) => void;
}

export function collectionMenuItems(
  collection: CollectionSchema,
  handlers: CollectionMenuHandlers,
  opts?: { disabled?: boolean }
): ContextMenuItem[] {
  const writable = collectionWritable(collection) && !opts?.disabled;
  const indexable = collectionIndexesManageable(collection) && !opts?.disabled;
  return [
    {
      id: 'open',
      label: 'Open',
      icon: <Table className="w-3.5 h-3.5" />,
      onSelect: () => handlers.onOpen(collection),
    },
    {
      id: 'insertDocument',
      label: 'Insert Document…',
      hint: shortcutLabel('edit.insertRow'),
      icon: <FilePlus2 className="w-3.5 h-3.5" />,
      disabled: !writable,
      onSelect: () => handlers.onInsertDocument(collection),
    },
    {
      id: 'newIndex',
      label: 'New Index…',
      hint: shortcutLabel('file.newIndex'),
      icon: <ListTree className="w-3.5 h-3.5" />,
      disabled: !indexable,
      onSelect: () => handlers.onNewIndex(collection),
    },
    { id: 'sep-drop', label: '', separator: true },
    {
      id: 'drop',
      label: 'Drop Collection…',
      danger: true,
      icon: <Trash2 className="w-3.5 h-3.5" />,
      disabled: Boolean(opts?.disabled),
      onSelect: () => handlers.onDrop(collection),
    },
  ];
}
