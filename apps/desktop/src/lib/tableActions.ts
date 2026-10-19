export type TableActionId =
  | 'open'
  | 'openSql'
  | 'edit'
  | 'newIndex'
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
  const isView = Boolean(opts.isView);
  const noun = isView ? 'View' : 'Table';
  const items: TableActionDescriptor[] = [
    { id: 'open', label: 'Open' },
    { id: 'openSql', label: 'Open in SQL Editor' },
  ];
  if (!opts.hideEdit) {
    items.push(
      { id: 'edit', label: `Edit ${noun}` },
      { id: 'newIndex', label: 'New Index…', disabled: isView }
    );
  }
  items.push(
    { id: 'copySchema', label: isView ? 'Copy View Definition' : 'Copy Table Schema' },
    { id: 'separator', separator: true },
    {
      id: 'empty',
      label: 'Empty Table',
      danger: true,
      disabled: isView,
    },
    {
      id: 'delete',
      label: `Delete ${noun}`,
      danger: true,
      disabled: false,
    }
  );
  return items;
}
