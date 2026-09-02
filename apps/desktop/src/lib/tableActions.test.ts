import { describe, expect, test } from 'bun:test';
import { tableActionDescriptors } from './tableActions';

describe('tableActionDescriptors', () => {
  test('lists open, sql, edit, copy, then empty and delete after a separator', () => {
    const ids = tableActionDescriptors({ isView: false }).map((item) => item.id);
    expect(ids).toEqual([
      'open',
      'openSql',
      'edit',
      'copySchema',
      'separator',
      'empty',
      'delete',
    ]);
  });

  test('marks empty and delete as danger', () => {
    const items = tableActionDescriptors({ isView: false });
    expect(items.find((item) => item.id === 'empty')).toMatchObject({
      label: 'Empty Table',
      danger: true,
      disabled: false,
    });
    expect(items.find((item) => item.id === 'delete')).toMatchObject({
      label: 'Delete Table',
      danger: true,
      disabled: false,
    });
  });

  test('disables empty and delete for views', () => {
    const items = tableActionDescriptors({ isView: true });
    expect(items.find((item) => item.id === 'empty')?.disabled).toBe(true);
    expect(items.find((item) => item.id === 'delete')?.disabled).toBe(true);
    expect(items.find((item) => item.id === 'open')?.disabled).toBeFalsy();
    expect(items.find((item) => item.id === 'edit')?.disabled).toBeFalsy();
  });

  test('omits edit when hideEdit is set', () => {
    const ids = tableActionDescriptors({ isView: false, hideEdit: true }).map(
      (item) => item.id
    );
    expect(ids).not.toContain('edit');
    expect(ids).toContain('open');
    expect(ids).toContain('copySchema');
  });
});
