import { formatAccelerator, type Platform } from './accelerator';
import type { MenuNode } from './menuModel';
import { acceleratorFor, commandById } from './registry';

export interface CheatSheetRow {
  label: string;
  shortcut: string;
}

export interface CheatSheetGroup {
  group: string;
  rows: CheatSheetRow[];
}

function collectRows(nodes: MenuNode[], platform: Platform, out: CheatSheetRow[]): void {
  for (const node of nodes) {
    if (node.kind === 'submenu') {
      collectRows(node.items, platform, out);
    } else if (node.kind === 'item') {
      const cmd = commandById(node.commandId);
      const accelerator = acceleratorFor(cmd, platform);
      if (accelerator) out.push({ label: cmd.label, shortcut: formatAccelerator(accelerator, platform) });
    }
  }
}

/**
 * Keyboard shortcut reference built from a (platform-adapted) menu model: one group per top-level
 * submenu that has an accelerated command, nested submenus flattened into their parent, in menu order.
 * Predefined items (Undo, Copy…) are not listed.
 */
export function cheatSheetRows(model: MenuNode[], platform: Platform): CheatSheetGroup[] {
  const groups: CheatSheetGroup[] = [];
  for (const node of model) {
    if (node.kind !== 'submenu') continue;
    const rows: CheatSheetRow[] = [];
    collectRows(node.items, platform, rows);
    if (rows.length > 0) groups.push({ group: node.label, rows });
  }
  return groups;
}
