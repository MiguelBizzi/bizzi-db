import { Eye, SquareFunction, Table } from 'lucide-react';
import { shortcutLabel } from '../lib/commands/shortcutLabel';
import type { ContextMenuItem } from './ui/ContextMenu';

export function createMenuItems(handlers: {
  onNewTable?: () => void;
  onNewView?: () => void;
  onNewFunction?: () => void;
}): ContextMenuItem[] {
  return [
    {
      id: 'new-table',
      label: 'New Table',
      hint: shortcutLabel('file.newTable'),
      icon: <Table className="w-3.5 h-3.5" />,
      disabled: !handlers.onNewTable,
      onSelect: handlers.onNewTable,
    },
    {
      id: 'new-view',
      label: 'New View',
      hint: shortcutLabel('file.newView'),
      icon: <Eye className="w-3.5 h-3.5" />,
      disabled: !handlers.onNewView,
      onSelect: handlers.onNewView,
    },
    {
      id: 'new-function',
      label: 'New Function',
      hint: shortcutLabel('file.newFunction'),
      icon: <SquareFunction className="w-3.5 h-3.5" />,
      disabled: !handlers.onNewFunction,
      onSelect: handlers.onNewFunction,
    },
  ];
}
