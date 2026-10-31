import type { Platform } from './accelerator';
import type { CommandContext } from './context';

export interface Command {
  id: string;
  label: string;
  dynamicLabel?(ctx: CommandContext): string;
  accelerator?: string;
  /** Replaces `accelerator` on Windows and Linux; macOS always uses `accelerator`. */
  nonMacAccelerator?: string;
  /** Replaces `nonMacAccelerator` and `accelerator` on Linux only. */
  linuxAccelerator?: string;
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
const tableDataActive = (ctx: CommandContext): boolean => ctx.activeTabType === 'table_data';
const hasPendingChanges = (ctx: CommandContext): boolean => ctx.pendingCount > 0;

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
  // Linux only: macOS has the native Quit and Windows has Alt+F4, so neither carries an accelerator.
  { id: 'app.quit', label: 'Quit', linuxAccelerator: 'CmdOrCtrl+Q', enabled: () => true, allowInModal: true },
  { id: 'file.newQuery', label: 'New Query Tab', accelerator: 'CmdOrCtrl+T', enabled: connectionOpen },
  { id: 'file.newConnection', label: 'New Connection…', accelerator: 'CmdOrCtrl+N', enabled: () => true },
  { id: 'file.newTable', label: 'New Table…', accelerator: 'CmdOrCtrl+Shift+N', enabled: connectionOpen },
  { id: 'file.newView', label: 'New View…', accelerator: 'CmdOrCtrl+Alt+V', enabled: connectionOpen },
  {
    id: 'file.newFunction',
    label: 'New Function…',
    accelerator: 'CmdOrCtrl+Alt+F',
    enabled: (ctx) => ctx.connectionOpen && ctx.capabilities.routines,
  },
  {
    id: 'file.newIndex',
    label: 'New Index…',
    accelerator: 'CmdOrCtrl+Shift+I',
    enabled: (ctx) =>
      ctx.connectionOpen &&
      (ctx.activeTabType === 'table_data' || ctx.activeTabType === 'schema_designer'),
  },
  { id: 'file.saveQuery', label: 'Save Query…', accelerator: 'CmdOrCtrl+S', enabled: sqlEditorActive },
  {
    id: 'file.export',
    label: 'Export Results…',
    accelerator: 'CmdOrCtrl+E',
    enabled: (ctx) => tableDataActive(ctx) || (sqlEditorActive(ctx) && ctx.sqlResultPresent),
  },
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
  // Grid commands share their keys with text editing (⌘F, ⌘I, ⌘⌫), so they yield to a focused input.
  { id: 'edit.find', label: 'Find in Table…', accelerator: 'CmdOrCtrl+F', enabled: tableDataActive, typingConflict: true },
  { id: 'edit.insertRow', label: 'Insert Row', accelerator: 'CmdOrCtrl+I', enabled: tableDataActive, typingConflict: true },
  {
    id: 'edit.deleteRows',
    label: 'Delete Selected Rows',
    accelerator: 'CmdOrCtrl+Backspace',
    nonMacAccelerator: 'Delete',
    enabled: (ctx) => tableDataActive(ctx) && ctx.selectedRowCount > 0,
    typingConflict: true,
  },
  { id: 'edit.formatSql', label: 'Format SQL', accelerator: 'CmdOrCtrl+Shift+F', enabled: sqlEditorActive },
  { id: 'edit.toggleComment', label: 'Toggle Comment', accelerator: 'CmdOrCtrl+/', enabled: sqlEditorActive },
  {
    id: 'query.run',
    label: 'Run Statement',
    dynamicLabel: (ctx) => (ctx.sqlSelectionPresent ? 'Run Selection' : 'Run Statement'),
    accelerator: 'CmdOrCtrl+Enter',
    enabled: sqlEditorActive,
  },
  { id: 'query.runAll', label: 'Run All', accelerator: 'CmdOrCtrl+Shift+Enter', enabled: sqlEditorActive },
  {
    id: 'query.commit',
    label: 'Commit Pending Changes',
    accelerator: 'CmdOrCtrl+Shift+S',
    enabled: hasPendingChanges,
  },
  { id: 'query.discard', label: 'Discard Pending Changes', enabled: hasPendingChanges },
  { id: 'query.review', label: 'Review Pending Changes', accelerator: 'CmdOrCtrl+Shift+P', enabled: connectionOpen },
  // Switch and Back stay enabled without a connection; their handlers are no-ops there.
  { id: 'conn.switch', label: 'Switch Connection…', enabled: () => true },
  { id: 'conn.back', label: 'Back to Connections', enabled: () => true },
  { id: 'conn.edit', label: 'Edit Connection…', enabled: connectionOpen },
  { id: 'conn.reconnect', label: 'Reconnect', enabled: connectionOpen },
  { id: 'conn.disconnect', label: 'Disconnect', enabled: connectionOpen },
  {
    id: 'conn.refreshSchema',
    label: 'Refresh Schema',
    accelerator: 'CmdOrCtrl+Shift+R',
    nonMacAccelerator: 'CmdOrCtrl+F5',
    linuxAccelerator: 'CmdOrCtrl+Shift+R',
    enabled: connectionOpen,
  },
  {
    id: 'conn.refreshTable',
    label: 'Refresh Table',
    accelerator: 'CmdOrCtrl+R',
    nonMacAccelerator: 'F5',
    enabled: tableDataActive,
  },
  {
    id: 'view.palette',
    label: 'Command Palette…',
    accelerator: 'CmdOrCtrl+K',
    // Always available: the palette also works on the connection picker (no connection).
    enabled: () => true,
    allowInModal: true,
  },
  { id: 'view.toggleSidebar', label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', enabled: connectionOpen },
  { id: 'view.erd', label: 'Schema Diagram (ERD)', accelerator: 'CmdOrCtrl+Shift+E', enabled: connectionOpen },
  { id: 'view.metrics', label: 'Database Metrics', accelerator: 'CmdOrCtrl+Shift+M', enabled: connectionOpen },
  { id: 'view.activity', label: 'Activity Log', accelerator: 'CmdOrCtrl+Shift+L', enabled: connectionOpen },
  { id: 'view.nextTab', label: 'Next Tab', accelerator: 'CmdOrCtrl+Shift+]', nonMacAccelerator: 'CmdOrCtrl+Tab', enabled: paneHasTabs(2) },
  { id: 'view.prevTab', label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', nonMacAccelerator: 'CmdOrCtrl+Shift+Tab', enabled: paneHasTabs(2) },
  ...goToTabCommands,
  { id: 'view.splitRight', label: 'Split Pane Right', accelerator: 'CmdOrCtrl+Alt+\\', enabled: tabActive },
  { id: 'view.splitDown', label: 'Split Pane Down', enabled: tabActive },
  { id: 'view.toggleFullscreen', label: 'Full Screen', nonMacAccelerator: 'F11', enabled: () => true },
  { id: 'help.docs', label: 'Documentation', enabled: () => true },
  { id: 'help.releaseNotes', label: 'Release Notes', enabled: () => true },
  { id: 'help.reportIssue', label: 'Report an Issue', enabled: () => true },
  { id: 'help.shortcuts', label: 'Keyboard Shortcuts…', enabled: () => true },
];

export function commandById(id: string): Command {
  const cmd = COMMANDS.find((c) => c.id === id);
  if (!cmd) throw new Error(`Unknown command "${id}"`);
  return cmd;
}

/** The accelerator `cmd` carries on `platform`, if any. */
export function acceleratorFor(cmd: Command, platform: Platform): string | undefined {
  if (platform === 'macos') return cmd.accelerator;
  if (platform === 'linux') return cmd.linuxAccelerator ?? cmd.nonMacAccelerator ?? cmd.accelerator;
  return cmd.nonMacAccelerator ?? cmd.accelerator;
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
