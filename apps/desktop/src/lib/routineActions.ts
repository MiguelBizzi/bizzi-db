export type RoutineActionId = 'open' | 'edit' | 'openSql' | 'copyName' | 'drop';

export interface RoutineActionDescriptor {
  id: RoutineActionId | 'separator';
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export function routineActionDescriptors(opts: {
  kind: 'function' | 'procedure';
  /** SQL-standard bodies can't be form-edited. */
  editable: boolean;
  disabled?: boolean;
}): RoutineActionDescriptor[] {
  const noun = opts.kind === 'procedure' ? 'Procedure' : 'Function';
  return [
    { id: 'open', label: 'Open' },
    { id: 'edit', label: `Edit ${noun}`, disabled: !opts.editable || opts.disabled },
    { id: 'openSql', label: 'Open Definition in SQL Editor', disabled: opts.disabled },
    { id: 'copyName', label: 'Copy Signature' },
    { id: 'separator', separator: true },
    { id: 'drop', label: `Delete ${noun}`, danger: true, disabled: opts.disabled },
  ];
}
