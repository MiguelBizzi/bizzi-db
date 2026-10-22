import { describe, expect, test } from 'bun:test';
import { formatAccelerator, type Platform } from './accelerator';
import { buildMenuModel, type MenuNode } from './menuModel';
import { adaptMenuModel } from './platformAdapter';
import { COMMANDS, acceleratorFor } from './registry';
import { cheatSheetRows } from './shortcutsCheatSheet';

const PLATFORMS: Platform[] = ['macos', 'windows', 'linux'];

function rowsFor(platform: Platform) {
  return cheatSheetRows(adaptMenuModel(buildMenuModel(), platform), platform);
}

describe('cheatSheetRows', () => {
  for (const platform of PLATFORMS) {
    describe(platform, () => {
      test('every command with an accelerator appears exactly once across all groups', () => {
        const rows = rowsFor(platform).flatMap((g) => g.rows);
        const accelerated = COMMANDS.filter((c) => acceleratorFor(c, platform) !== undefined);
        for (const cmd of accelerated) {
          const shortcut = formatAccelerator(acceleratorFor(cmd, platform) as string, platform);
          const matches = rows.filter((r) => r.label === cmd.label && r.shortcut === shortcut);
          expect(matches.length).toBe(1);
        }
        expect(rows.length).toBe(accelerated.length);
      });

      test('commands without an accelerator never appear', () => {
        const labels = new Set(rowsFor(platform).flatMap((g) => g.rows.map((r) => r.label)));
        for (const cmd of COMMANDS.filter((c) => acceleratorFor(c, platform) === undefined)) {
          expect(labels.has(cmd.label)).toBe(false);
        }
      });

      test('every group has at least one row and predefined items are not listed', () => {
        for (const group of rowsFor(platform)) {
          expect(group.rows.length).toBeGreaterThan(0);
          for (const row of group.rows) expect(row.label).not.toBe('Undo');
        }
      });

      test('group order follows the top-level menu order', () => {
        const model = adaptMenuModel(buildMenuModel(), platform);
        const order = model.flatMap((n) => (n.kind === 'submenu' ? [n.label] : []));
        const groups = rowsFor(platform).map((g) => g.group);
        const positions = groups.map((g) => order.indexOf(g));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      });

      test('Go to Tab commands are flattened into the View group, in order', () => {
        const groups = rowsFor(platform);
        const view = groups.find((g) => g.group === 'View');
        expect(view).toBeDefined();
        const labels = view?.rows.map((r) => r.label) ?? [];
        const tabs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Tab ${n}`).concat('Last Tab');
        for (const label of tabs) expect(labels).toContain(label);
        expect(labels.filter((l) => tabs.includes(l))).toEqual(tabs);
        expect(groups.some((g) => g.group === 'Go to Tab')).toBe(false);
      });
    });
  }

  test('macOS uses glyph shortcuts', () => {
    const rows = rowsFor('macos').flatMap((g) => g.rows);
    expect(rows.find((r) => r.label === 'Settings…')?.shortcut).toBe('⌘,');
    expect(rows.find((r) => r.label === 'New Table…')?.shortcut).toBe('⇧⌘N');
  });

  test('Windows uses Ctrl+ shortcuts and lists Settings under Edit', () => {
    const groups = rowsFor('windows');
    const edit = groups.find((g) => g.group === 'Edit');
    expect(edit?.rows.find((r) => r.label === 'Settings…')?.shortcut).toBe('Ctrl+,');
  });

  test('Windows uses its own overrides for Delete Selected Rows and Full Screen', () => {
    const groups = rowsFor('windows');
    const rowsOf = (name: string) => groups.find((g) => g.group === name)?.rows ?? [];
    expect(rowsOf('Edit')).toContainEqual({ label: 'Delete Selected Rows', shortcut: 'Delete' });
    expect(rowsOf('View')).toContainEqual({ label: 'Full Screen', shortcut: 'F11' });
  });

  test('macOS groups are exactly the menus with accelerated commands, in menu order', () => {
    expect(rowsFor('macos').map((g) => g.group)).toEqual(['Bizzi DB', 'File', 'Edit', 'Query', 'Connection', 'View']);
  });

  test('skips separators and submenus without accelerated commands', () => {
    const model: MenuNode[] = [
      { kind: 'submenu', id: 'a', label: 'A', items: [{ kind: 'item', commandId: 'conn.switch' }, { kind: 'separator' }] },
      {
        kind: 'submenu',
        id: 'b',
        label: 'B',
        items: [
          { kind: 'predefined', item: 'copy' },
          { kind: 'item', commandId: 'file.closeTab' },
        ],
      },
    ];
    expect(cheatSheetRows(model, 'macos')).toEqual([{ group: 'B', rows: [{ label: 'Close Tab', shortcut: '⌘W' }] }]);
  });

  test('uses the static label, not the dynamic one', () => {
    const rows = rowsFor('macos').flatMap((g) => g.rows);
    expect(rows.some((r) => r.label === 'Run Statement')).toBe(true);
    expect(rows.some((r) => r.label === 'Run Selection')).toBe(false);
  });
});
