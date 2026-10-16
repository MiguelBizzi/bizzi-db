import type { CommandContext } from './context';

export interface Command {
  id: string;
  label: string;
  dynamicLabel?(ctx: CommandContext): string;
  accelerator?: string;
  enabled(ctx: CommandContext): boolean;
  allowInModal?: boolean;
  typingConflict?: boolean;
}

const connectionOpen = (ctx: CommandContext): boolean => ctx.connectionOpen;

export const COMMANDS: readonly Command[] = [
  { id: 'app.settings', label: 'Settings…', accelerator: 'CmdOrCtrl+,', enabled: () => true, allowInModal: true },
  { id: 'app.checkUpdates', label: 'Check for Updates…', enabled: () => true },
  { id: 'file.newQuery', label: 'New Query Tab', accelerator: 'CmdOrCtrl+T', enabled: connectionOpen },
  {
    id: 'file.closeWindow',
    label: 'Close Window',
    accelerator: 'CmdOrCtrl+Shift+W',
    enabled: () => true,
    allowInModal: true,
  },
  { id: 'query.review', label: 'Review Pending Changes', accelerator: 'CmdOrCtrl+Shift+P', enabled: connectionOpen },
  {
    id: 'conn.refreshTable',
    label: 'Refresh Table',
    accelerator: 'CmdOrCtrl+R',
    enabled: (ctx) => ctx.activeTabType === 'table_data',
  },
  {
    id: 'view.palette',
    label: 'Command Palette…',
    accelerator: 'CmdOrCtrl+K',
    // Always available: the palette also works on the connection picker (no connection).
    enabled: () => true,
    allowInModal: true,
  },
  { id: 'view.erd', label: 'Schema Diagram (ERD)', accelerator: 'CmdOrCtrl+Shift+E', enabled: connectionOpen },
  { id: 'view.metrics', label: 'Database Metrics', accelerator: 'CmdOrCtrl+Shift+M', enabled: connectionOpen },
  { id: 'view.activity', label: 'Activity Log', accelerator: 'CmdOrCtrl+Shift+L', enabled: connectionOpen },
];

export function commandById(id: string): Command {
  const cmd = COMMANDS.find((c) => c.id === id);
  if (!cmd) throw new Error(`Unknown command "${id}"`);
  return cmd;
}

export function isCommandEnabled(cmd: Command, ctx: CommandContext): boolean {
  if (ctx.modalOpen && !cmd.allowInModal) return false;
  if (cmd.typingConflict && ctx.textInputFocused) return false;
  return cmd.enabled(ctx);
}

export function menuState(
  ctx: CommandContext,
  commands: readonly Command[] = COMMANDS,
): { enabled: Record<string, boolean>; labels: Record<string, string> } {
  const enabled: Record<string, boolean> = {};
  const labels: Record<string, string> = {};
  for (const cmd of commands) {
    enabled[cmd.id] = isCommandEnabled(cmd, ctx);
    labels[cmd.id] = cmd.dynamicLabel ? cmd.dynamicLabel(ctx) : cmd.label;
  }
  return { enabled, labels };
}
