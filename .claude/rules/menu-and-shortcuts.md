---
description: Every new user-facing feature gets a menu item and a keyboard shortcut
alwaysApply: true
---

# Menu items and shortcuts for new features

Any new feature a user can start (create, open, edit or delete an object; open a view or panel; run an action) is reachable from the native menu bar and has a keyboard shortcut. Don't leave a feature reachable only by clicking.

## Checklist

1. **Command** in `apps/desktop/src/lib/commands/registry.ts`: `id` (`area.verb`, e.g. `file.newView`), `label` (ends in `…` when it opens a form), an `accelerator`, and an `enabled(ctx)` rule. Omit the accelerator only when no sensible free combination exists, and say why in the PR.
2. **Accelerator** must be:
   - unique (the registry tests enforce it)
   - not in `lib/commands/reserved.ts`
   - not `CmdOrCtrl+Alt+I`, which opens the webview devtools
   - mnemonic where possible: `CmdOrCtrl+Shift+N` new table, `CmdOrCtrl+Alt+V` new view
   
   Editor keymaps drop bindings that clash with menu accelerators (`lib/editorKeymap.ts`); check the shortcut still works with focus in a SQL editor.
3. **Menu item** in `lib/commands/menuModel.ts`, in the submenu where users would look for it (creation goes under File, next to the other `file.new*` items).
4. **Handler** keyed by the command id in `App.tsx` (`useAppMenu` handlers) or in a component scope (`registerScope`). `handlerWiring.test.ts` fails if no handler exists.
5. **Tests**: update the expected lists in `registry.test.ts` and `menuModel.test.ts`, and add `enabled` cases for the new rule.
6. **Show the shortcut** wherever the action also appears:
   - context menus and popovers: `hint: shortcutLabel(id)`
   - command palette quick actions: `shortcut: shortcutLabel(id)`
   
   The Help → Keyboard Shortcuts sheet is generated from the menu model, so it updates on its own.
7. **Overlays** a feature opens must gate the menu: add them to the `modals` map in `App.tsx`, or call `useMenuModalGate` for a component's own drawers and dialogs.
8. **New Tauri commands** must also be listed in `apps/desktop/src-tauri/permissions/app.toml`, or the app rejects them with "not allowed" (`ipcPermissions.test.ts` checks this).
