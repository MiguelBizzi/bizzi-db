import type { Platform } from './accelerator';
import type { MenuNode } from './menuModel';

type Submenu = Extract<MenuNode, { kind: 'submenu' }>;

const separator = (): MenuNode => ({ kind: 'separator' });

function isSubmenu(node: MenuNode, id: string): boolean {
  return node.kind === 'submenu' && node.id === id;
}

function asSubmenu(node: MenuNode): Submenu {
  if (node.kind !== 'submenu') throw new Error('Expected a submenu node');
  return node;
}

/**
 * Adapts the neutral (macOS-shaped) model to a platform. Pure: never mutates `model`.
 * On Windows/Linux the app menu is dissolved: Settings goes to the end of Edit, Quit to the
 * end of File, and About / Check for Updates move into Help.
 */
export function adaptMenuModel(model: MenuNode[], platform: Platform): MenuNode[] {
  const cloned = structuredClone(model);
  if (platform === 'macos') return cloned;

  const helpLead: MenuNode[] = [
    { kind: 'predefined', item: 'about' },
    { kind: 'item', commandId: 'app.checkUpdates' },
  ];

  const hasHelp = cloned.some((n) => isSubmenu(n, 'help'));
  const adapted: MenuNode[] = [];
  for (const node of cloned) {
    if (isSubmenu(node, 'app')) continue;
    if (isSubmenu(node, 'edit')) {
      asSubmenu(node).items.push(separator(), { kind: 'item', commandId: 'app.settings' });
    } else if (isSubmenu(node, 'file')) {
      asSubmenu(node).items.push(separator(), { kind: 'predefined', item: 'quit' });
    } else if (isSubmenu(node, 'view')) {
      const view = asSubmenu(node);
      view.items = view.items.map((item) =>
        item.kind === 'predefined' && item.item === 'fullscreen'
          ? { kind: 'item', commandId: 'view.toggleFullscreen' }
          : item,
      );
    } else if (isSubmenu(node, 'help')) {
      const help = asSubmenu(node);
      help.items.unshift(...helpLead, ...(help.items.length > 0 ? [separator()] : []));
    }
    adapted.push(node);
  }

  if (!hasHelp) {
    adapted.push({ kind: 'submenu', id: 'help', label: 'Help', role: 'help', items: helpLead });
  }
  return adapted;
}
