import type { WorkspaceTab } from '../../types';
import { EMPTY_CONTEXT, type CommandContext } from './context';

export interface AppContextInput {
  tabs: WorkspaceTab[];
  activeTabId: string;
  currentDbId: string | null;
  pendingCount: number;
  /** Number of tabs in the focused pane (0 when there is none). */
  paneTabCount: number;
  /** Size of the closed-tab stack. */
  closedTabCount: number;
  /** Named open flags of modals and drawers; any `true` makes `modalOpen` true. */
  modals: Record<string, boolean>;
}

/** The app-level part of the command context (pure). Local scopes and focus are merged later. */
export function deriveCommandContext(input: AppContextInput): CommandContext {
  const activeTab = input.tabs.find((t) => t.id === input.activeTabId);
  return {
    ...EMPTY_CONTEXT,
    activeTabType: activeTab?.type ?? null,
    tabCount: input.tabs.length,
    paneTabCount: input.paneTabCount,
    closedTabCount: input.closedTabCount,
    pendingCount: input.pendingCount,
    connectionOpen: Boolean(input.currentDbId),
    modalOpen: Object.values(input.modals).some(Boolean),
  };
}
