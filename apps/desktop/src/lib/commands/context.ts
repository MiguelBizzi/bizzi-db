import type { TabType } from '../../types';

export interface CommandContext {
  activeTabType: TabType | null;
  tabCount: number;
  paneTabCount: number;
  selectedRowCount: number;
  pendingCount: number;
  connectionOpen: boolean;
  modalOpen: boolean;
  textInputFocused: boolean;
  sqlSelectionPresent: boolean;
  sqlResultPresent: boolean;
  closedTabCount: number;
}

export const EMPTY_CONTEXT: CommandContext = {
  activeTabType: null,
  tabCount: 0,
  paneTabCount: 0,
  selectedRowCount: 0,
  pendingCount: 0,
  connectionOpen: false,
  modalOpen: false,
  textInputFocused: false,
  sqlSelectionPresent: false,
  sqlResultPresent: false,
  closedTabCount: 0,
};

const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable="true"], .cm-content';

export function isTextInputTarget(el: { closest(selector: string): unknown } | null): boolean {
  if (!el) return false;
  return Boolean(el.closest(TEXT_INPUT_SELECTOR));
}
