export type TableActionId =
  | 'open'
  | 'openSql'
  | 'edit'
  | 'copySchema'
  | 'empty'
  | 'delete';

export interface TableActionDescriptor {
  id: TableActionId | 'separator';
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export function tableActionDescriptors(opts: {
  isView?: boolean;
  hideEdit?: boolean;
}): TableActionDescriptor[] {
  const destructiveDisabled = Boolean(opts.isView);
  const items: TableActionDescriptor[] = [
    { id: 'open', label: 'Open' },
    { id: 'openSql', label: 'Open in SQL Editor' },
  ];
  if (!opts.hideEdit) {
    items.push({ id: 'edit', label: 'Edit Table' });
  }
  items.push(
    { id: 'copySchema', label: 'Copy Table Schema' },
    { id: 'separator', separator: true },
    {
      id: 'empty',
      label: 'Empty Table',
      danger: true,
      disabled: destructiveDisabled,
    },
    {
      id: 'delete',
      label: 'Delete Table',
      danger: true,
      disabled: destructiveDisabled,
    }
  );
  return items;
}
