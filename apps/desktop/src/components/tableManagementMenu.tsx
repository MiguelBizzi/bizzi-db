import type { ReactNode } from 'react';
import { Code, Copy, Edit3, Eraser, Table, Trash2 } from 'lucide-react';
import type { TableSchema } from '../types';
import {
  tableActionDescriptors,
  type TableActionId,
} from '../lib/tableActions';
import type { ContextMenuItem } from './ui/ContextMenu';

const ICONS: Record<TableActionId, ReactNode> = {
  open: <Table className="w-3.5 h-3.5" />,
  openSql: <Code className="w-3.5 h-3.5" />,
  edit: <Edit3 className="w-3.5 h-3.5" />,
  copySchema: <Copy className="w-3.5 h-3.5" />,
  empty: <Eraser className="w-3.5 h-3.5" />,
  delete: <Trash2 className="w-3.5 h-3.5" />,
};

export interface TableManagementHandlers {
  onOpen: (table: TableSchema) => void;
  onOpenSql: (table: TableSchema) => void;
  onEdit?: (table: TableSchema) => void;
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
