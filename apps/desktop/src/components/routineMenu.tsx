import type { ReactNode } from 'react';
import { Code, Copy, Pencil, SquareFunction, Trash2 } from 'lucide-react';
import type { RoutineDefinition } from '../types';
import { routineActionDescriptors, type RoutineActionId } from '../lib/routineActions';
import type { ContextMenuItem } from './ui/ContextMenu';

const ICONS: Record<RoutineActionId, ReactNode> = {
  open: <SquareFunction className="w-3.5 h-3.5" />,
  edit: <Pencil className="w-3.5 h-3.5" />,
  openSql: <Code className="w-3.5 h-3.5" />,
  copyName: <Copy className="w-3.5 h-3.5" />,
  drop: <Trash2 className="w-3.5 h-3.5" />,
};

export interface RoutineMenuHandlers {
  onOpen: (routine: RoutineDefinition) => void;
  onEdit: (routine: RoutineDefinition) => void;
  onOpenSql: (routine: RoutineDefinition) => void;
  onCopyName: (routine: RoutineDefinition) => void;
  onDrop: (routine: RoutineDefinition) => void;
}

export function routineMenuItems(
  routine: RoutineDefinition,
  handlers: RoutineMenuHandlers,
  opts?: { disabled?: boolean }
): ContextMenuItem[] {
  return routineActionDescriptors({
    kind: routine.kind,
    editable: !routine.hasSqlBody,
    disabled: opts?.disabled,
  }).map((item) => {
    if (item.separator) return { id: item.id, label: '', separator: true };
    const id = item.id as RoutineActionId;
    const run = {
      open: handlers.onOpen,
      edit: handlers.onEdit,
      openSql: handlers.onOpenSql,
      copyName: handlers.onCopyName,
      drop: handlers.onDrop,
    }[id];
    return {
      id,
      label: item.label ?? '',
      danger: item.danger,
      disabled: item.disabled,
      icon: ICONS[id],
      onSelect: () => run(routine),
    };
  });
}
