import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
  type MenuOptions,
  type PredefinedMenuItemOptions,
  type SubmenuOptions,
} from '@tauri-apps/api/menu';
import { toTauriAccelerator, type Platform } from './accelerator';
import type { MenuNode, PredefinedKind } from './menuModel';
import { commandById } from './registry';

type StateValue = boolean | string;

/** Only the entries of `next` whose value differs from `prev` (pure). */
export function diffState(
  prev: Record<string, StateValue>,
  next: Record<string, StateValue>,
): Record<string, StateValue> {
  const changed: Record<string, StateValue> = {};
  for (const [key, value] of Object.entries(next)) {
    if (prev[key] !== value) changed[key] = value;
  }
  return changed;
}

// The minimal surface of `@tauri-apps/api/menu` the host uses, so tests can inject a fake.
// Children are passed through opaquely; only the host builds them.
export interface MenuItemHandle {
  setEnabled(enabled: boolean): Promise<void>;
  setText(text: string): Promise<void>;
}

export interface SubmenuHandle {
  setAsWindowsMenuForNSApp(): Promise<void>;
  setAsHelpMenuForNSApp(): Promise<void>;
}

export interface MenuHandle {
  setAsAppMenu(): Promise<unknown>;
  setAsWindowMenu(): Promise<unknown>;
}

export interface MenuApi {
  Menu: { new: (opts: { items: unknown[] }) => Promise<MenuHandle> };
  Submenu: { new: (opts: { id: string; text: string; items: unknown[] }) => Promise<SubmenuHandle> };
  MenuItem: {
    new: (opts: {
      id: string;
      text: string;
      accelerator?: string;
      action: () => void;
    }) => Promise<MenuItemHandle>;
  };
  PredefinedMenuItem: { new: (opts: { item: PredefinedMenuItemOptions['item']; text?: string }) => Promise<unknown> };
}

export const tauriMenuApi: MenuApi = {
  Menu: { new: (opts) => Menu.new(opts as MenuOptions) },
  Submenu: { new: (opts) => Submenu.new(opts as SubmenuOptions) },
  MenuItem: { new: (opts) => MenuItem.new(opts) },
  PredefinedMenuItem: { new: (opts) => PredefinedMenuItem.new(opts) },
};

export interface MenuHost {
  applyState(state: { enabled: Record<string, boolean>; labels: Record<string, string> }): Promise<void>;
}

// `null` = not supported by the Tauri 2.2.0 menu plugin (no `BringAllToFront` variant); skipped.
const PREDEFINED: Record<PredefinedKind, PredefinedMenuItemOptions['item'] | null> = {
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'SelectAll',
  about: { About: null },
  services: 'Services',
  hide: 'Hide',
  hideOthers: 'HideOthers',
  showAll: 'ShowAll',
  quit: 'Quit',
  minimize: 'Minimize',
  maximize: 'Maximize',
  fullscreen: 'Fullscreen',
  bringAllToFront: null,
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface BuildContext {
  api: MenuApi;
  platform: Platform;
  onRun(commandId: string): void;
  items: Map<string, MenuItemHandle>;
  roles: Array<{ role: 'window' | 'help'; submenu: SubmenuHandle }>;
}

async function buildNode(node: MenuNode, ctx: BuildContext): Promise<unknown | null> {
  switch (node.kind) {
    case 'separator':
      return ctx.api.PredefinedMenuItem.new({ item: 'Separator' });
    case 'predefined': {
      const item = PREDEFINED[node.item];
      if (item === null) return null;
      if (node.item === 'quit' && ctx.platform !== 'macos') {
        return ctx.api.PredefinedMenuItem.new({ item, text: 'Exit' });
      }
      return ctx.api.PredefinedMenuItem.new({ item });
    }
    case 'item': {
      const command = commandById(node.commandId);
      const created = await ctx.api.MenuItem.new({
        id: node.commandId,
        text: command.label,
        ...(command.accelerator ? { accelerator: toTauriAccelerator(command.accelerator) } : {}),
        action: () => ctx.onRun(node.commandId),
      });
      ctx.items.set(node.commandId, created);
      return created;
    }
    case 'submenu': {
      const children = await buildChildren(node.items, ctx);
      const submenu = await ctx.api.Submenu.new({ id: node.id, text: node.label, items: children });
      if (node.role) ctx.roles.push({ role: node.role, submenu });
      return submenu;
    }
  }
}

async function buildChildren(nodes: MenuNode[], ctx: BuildContext): Promise<unknown[]> {
  const children: Array<{ node: MenuNode; built: unknown }> = [];
  for (const node of nodes) {
    const built = await buildNode(node, ctx);
    if (built !== null) children.push({ node, built });
  }
  // Skipped items can leave a dangling separator at the end of a submenu; drop it.
  while (children.length > 0 && children[children.length - 1]?.node.kind === 'separator') children.pop();
  return children.map((c) => c.built);
}

/**
 * Builds the native menu from the model and installs it. Resolves `null` (after one
 * `console.error` if something threw) when the menu is unavailable, e.g. outside Tauri.
 */
export async function installMenu(opts: {
  model: MenuNode[];
  platform: Platform;
  onRun(commandId: string): void;
  api?: MenuApi;
  isTauri?: () => boolean;
}): Promise<MenuHost | null> {
  if (!(opts.isTauri ?? isTauriRuntime)()) return null;
  try {
    const api = opts.api ?? tauriMenuApi;
    const ctx: BuildContext = {
      api,
      platform: opts.platform,
      onRun: opts.onRun,
      items: new Map(),
      roles: [],
    };
    const items = await buildChildren(opts.model, ctx);
    const menu = await api.Menu.new({ items });
    if (opts.platform === 'macos') {
      await menu.setAsAppMenu();
      // The custom menu is live now, so NSApp role registration failures are non-fatal: keep the host.
      const roleFailures: unknown[] = [];
      for (const { role, submenu } of ctx.roles) {
        try {
          if (role === 'window') await submenu.setAsWindowsMenuForNSApp();
          else await submenu.setAsHelpMenuForNSApp();
        } catch (error) {
          roleFailures.push(error);
        }
      }
      if (roleFailures.length > 0) {
        console.error('Failed to register menus with NSApp', roleFailures);
      }
    } else {
      await menu.setAsWindowMenu();
    }

    // Items start enabled with their registry label, so the first applyState applies everything.
    const enabled: Record<string, boolean> = {};
    const labels: Record<string, string> = {};
    return {
      async applyState(state) {
        const failed: Array<{ id: string; error: unknown }> = [];
        // A key is cached only after its call succeeds, so failed keys are retried next time.
        for (const [id, value] of Object.entries(diffState(enabled, state.enabled))) {
          try {
            await ctx.items.get(id)?.setEnabled(value as boolean);
            enabled[id] = value as boolean;
          } catch (error) {
            failed.push({ id, error });
          }
        }
        for (const [id, value] of Object.entries(diffState(labels, state.labels))) {
          try {
            await ctx.items.get(id)?.setText(value as string);
            labels[id] = value as string;
          } catch (error) {
            failed.push({ id, error });
          }
        }
        if (failed.length > 0) {
          console.error(`Failed to update native menu items: ${failed.map((f) => f.id).join(', ')}`, failed);
        }
      },
    };
  } catch (error) {
    console.error('Failed to install the native menu', error);
    return null;
  }
}
