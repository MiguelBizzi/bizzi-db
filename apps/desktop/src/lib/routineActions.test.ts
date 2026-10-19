import { describe, expect, test } from 'bun:test';
import { routineActionDescriptors } from './routineActions';

describe('routineActionDescriptors', () => {
  test('lists open, edit, sql, copy, then delete after a separator', () => {
    const items = routineActionDescriptors({ kind: 'function', editable: true });
    expect(items.map((item) => item.id)).toEqual(['open', 'edit', 'openSql', 'copyName', 'separator', 'drop']);
    expect(items.find((item) => item.id === 'drop')).toMatchObject({
      label: 'Delete Function',
      danger: true,
    });
  });

  test('names procedures and disables edit for non-editable bodies', () => {
    const items = routineActionDescriptors({ kind: 'procedure', editable: false });
    expect(items.find((item) => item.id === 'edit')).toMatchObject({
      label: 'Edit Procedure',
      disabled: true,
    });
    expect(items.find((item) => item.id === 'drop')?.disabled).toBeFalsy();
  });

  test('disconnected disables everything that needs the database', () => {
    const items = routineActionDescriptors({ kind: 'function', editable: true, disabled: true });
    const disabled = items.filter((item) => item.disabled).map((item) => item.id);
    expect(disabled).toEqual(['edit', 'openSql', 'drop']);
  });
});
