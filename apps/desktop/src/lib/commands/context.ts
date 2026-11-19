import type { Paradigm } from '@db/shared';
import type { TabType } from '../../types';

export interface CommandCapabilities {
  /** New Function is available. Engines without routines leave it off. */
  routines: boolean;
}

export interface CommandContext {
  activeTabType: TabType | null;
  tabCount: number;
  paneTabCount: number;
  selectedRowCount: number;
  pendingCount: number;
  connectionOpen: boolean;
  /** Paradigm of the connected engine; `null` when no connection is open. */
  paradigm: Paradigm | null;
  modalOpen: boolean;
  textInputFocused: boolean;
  /** A foreign key field or grid cell is focused and can open the referenced-row sheet. */
  foreignKeyTarget: boolean;
  sqlSelectionPresent: boolean;
  sqlResultPresent: boolean;
  closedTabCount: number;
  /** Set by a collection tab whose documents cannot be written here (a view or time-series). */
  collectionReadOnly: boolean;
  /** Set by a collection tab that cannot take indexes (a view). */
  collectionIndexesReadOnly: boolean;
  capabilities: CommandCapabilities;
}

export const EMPTY_CONTEXT: CommandContext = {
  activeTabType: null,
  tabCount: 0,
  paneTabCount: 0,
  selectedRowCount: 0,
  pendingCount: 0,
  connectionOpen: false,
  paradigm: null,
  modalOpen: false,
  textInputFocused: false,
  foreignKeyTarget: false,
  sqlSelectionPresent: false,
  sqlResultPresent: false,
  closedTabCount: 0,
  collectionReadOnly: false,
  collectionIndexesReadOnly: false,
  capabilities: { routines: true },
};

/** Input types that take no typed text (a focused row checkbox is not typing). */
const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];

/** Elements that accept text, whose own editing keys menu commands must not take over. */
export const TEXT_INPUT_SELECTOR =
  'input' +
  NON_TEXT_INPUT_TYPES.map((type) => `:not([type=${type}])`).join('') +
  ', textarea, select, [contenteditable="true"], .cm-content';

export function isTextInputTarget(el: { closest(selector: string): unknown } | null): boolean {
  if (!el) return false;
  return Boolean(el.closest(TEXT_INPUT_SELECTOR));
}
