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
const sqlEditorActive = (ctx: CommandContext): boolean => ctx.activeTabType === 'sql_editor';
const paneHasTabs =
  (min: number) =>
  (ctx: CommandContext): boolean =>
    ctx.paneTabCount >= min;
const tabActive = (ctx: CommandContext): boolean => ctx.activeTabType !== null;

/** `view.tab.1`…`view.tab.8` select that tab; `view.tab.9` selects the last (browser convention). */
const goToTabCommands: Command[] = Array.from({ length: 9 }, (_, i) => {
  const n = i + 1;
  return {
    id: `view.tab.${n}`,
    label: n === 9 ? 'Last Tab' : `Tab ${n}`,
    accelerator: `CmdOrCtrl+${n}`,
    enabled: paneHasTabs(n === 9 ? 1 : n),
  };
});

export const COMMANDS: readonly Command[] = [
  { id: 'app.settings', label: 'Settings…', accelerator: 'CmdOrCtrl+,', enabled: () => true, allowInModal: true },
  { id: 'app.checkUpdates', label: 'Check for Updates…', enabled: () => true },
  { id: 'file.newQuery', label: 'New Query Tab', accelerator: 'CmdOrCtrl+T', enabled: connectionOpen },
  { id: 'file.closeTab', label: 'Close Tab', accelerator: 'CmdOrCtrl+W', enabled: paneHasTabs(1) },
  { id: 'file.closeOthers', label: 'Close Other Tabs', accelerator: 'CmdOrCtrl+Alt+W', enabled: paneHasTabs(2) },
  { id: 'file.closeRight', label: 'Close Tabs to the Right', enabled: paneHasTabs(2) },
  {
    id: 'file.reopenTab',
    label: 'Reopen Closed Tab',
    accelerator: 'CmdOrCtrl+Shift+T',
    enabled: (ctx) => ctx.closedTabCount > 0,
  },
  {
    id: 'file.closeWindow',
    label: 'Close Window',
    accelerator: 'CmdOrCtrl+Shift+W',
    enabled: () => true,
    allowInModal: true,
  },
  {
    id: 'query.run',
    label: 'Run Statement',
    dynamicLabel: (ctx) => (ctx.sqlSelectionPresent ? 'Run Selection' : 'Run Statement'),
    accelerator: 'CmdOrCtrl+Enter',
    enabled: sqlEditorActive,
  },
  { id: 'query.runAll', label: 'Run All', accelerator: 'CmdOrCtrl+Shift+Enter', enabled: sqlEditorActive },
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
  { id: 'view.nextTab', label: 'Next Tab', accelerator: 'CmdOrCtrl+Shift+]', enabled: paneHasTabs(2) },
  { id: 'view.prevTab', label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', enabled: paneHasTabs(2) },
  ...goToTabCommands,
  { id: 'view.splitRight', label: 'Split Pane Right', accelerator: 'CmdOrCtrl+Alt+\\', enabled: tabActive },
  { id: 'view.splitDown', label: 'Split Pane Down', enabled: tabActive },
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
