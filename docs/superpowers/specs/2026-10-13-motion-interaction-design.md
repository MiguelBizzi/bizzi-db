# Motion and Interaction Design — Desktop App

Date: 2026-10-13
Status: awaiting review
Scope: `apps/desktop` only. `apps/web` is not touched.

## Goal

Give Bizzi DB one consistent motion language so the app feels fluid and
responsive instead of static, without making it slower or less accessible.

Success means:

- The same kind of interaction produces the same motion everywhere.
- Overlays animate out as well as in; nothing pops or vanishes.
- Every interactive element gives hover, press and focus feedback.
- No animation is longer than 240ms, and none blocks input.
- A user who chooses reduced motion gets a near-static app.
- `tsc --noEmit` and `bun test` stay green; no behaviour changes.

## Current state

- `motion` v12 is installed but used in two files only: `components/ui/Toaster.tsx`
  and the tab indicator in `components/TabsBar.tsx`.
- Modals, drawers and the command palette each hand-roll the same scrim markup
  and `return null` when closed, so they have no exit animation. Two drawers
  have a CSS enter keyframe (`pending-drawer-in`).
- 87 `transition-colors` uses rely on Tailwind's default timing. There are no
  motion tokens.
- 11 components have no transitions at all, including `ui/ContextMenu.tsx`,
  `Modals/SettingsModal.tsx`, `WorkspacePanes.tsx`, `UpdateBanner.tsx` and
  `ui/SplitHandle.tsx`.
- Nothing in CSS honours `prefers-reduced-motion`. Only the Toaster and
  TabsBar check it, through `useReducedMotion()`.

## Approach

Shared primitives built on `motion`, plus CSS tokens. Enter/exit and layout
animation go through `motion`; hover, press and focus stay in CSS. No new
dependencies.

Rejected: CSS only (exit animations would need unmount-delay plumbing in every
overlay), and per-component `motion` props with no shared layer (produces
inconsistent motion).

## 1. Tokens

Added to `:root` in `src/index.css`:

| Token | Value | Used for |
| --- | --- | --- |
| `--motion-fast` | 120ms | hover, press, focus, row highlight |
| `--motion-base` | 180ms | popovers, menus, modals, view crossfade |
| `--motion-slow` | 240ms | drawers, height expand/collapse |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | entering, state changes |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | exiting |

Exits run at 75% of the matching enter duration.

A base-layer rule gives these elements a default transition of `color`,
`background-color`, `border-color`, `box-shadow` and `opacity` at
`--motion-fast` with `--ease-out`:

`button`, `a`, `input`, `textarea`, `select`, and `[role]` of `button`,
`menuitem`, `tab`, `option`, `switch`, `checkbox`.

This covers the components with no transitions. Tailwind utilities override
the base layer, so the existing `transition-colors` uses are normalised
separately by setting `--default-transition-duration: 120ms` and
`--default-transition-timing-function` to the `--ease-out` curve in the
`@theme` block. No per-file edits are needed for hover timing.

## 2. Motion module

`src/lib/motion.ts` exports the durations and easings as numbers (seconds, to
match `motion`'s API) and these variants, each with `initial`, `animate` and
`exit`:

| Variant | Motion | Used by |
| --- | --- | --- |
| `fade` | opacity 0 → 1 | scrims, empty states |
| `scaleIn` | opacity, scale 0.97 → 1 | modals, command palette |
| `slideInRight` | opacity, x 24px → 0 | drawers |
| `popIn` | opacity, scale 0.96 → 1, 4px offset from the trigger side | menus, selects, popovers |
| `viewEnter` | opacity 0 → 1, `--motion-fast`, no exit | pane content on tab change |
| `collapse` | height 0 ↔ auto, opacity | connection folders |
| `slideUp` | opacity, y 8px → 0 | update banner |

The CSS tokens and the JS constants hold the same values. `motion.ts` is the
source for JS; a unit test asserts the two stay in sync by reading
`index.css`.

## 3. Motion preference and reduced motion

`src/lib/motionPreference.ts`:

- Type `MotionPreference = 'on' | 'system' | 'reduced'`.
- Stored in `localStorage` under `bizzi.motion`. Default is `'on'`.
- `resolveReducedMotion(pref, systemPrefersReduced): boolean` — pure.
  `'on'` → false, `'reduced'` → true, `'system'` → `systemPrefersReduced`.
- The preference lives in a small module-level store (same shape as
  `lib/toast.ts`): `getMotionPreference`, `setMotionPreference`,
  `subscribeMotionPreference`.
- `useMotionPreference()` returns `{ preference, reduced, setPreference }` and
  subscribes to both the store and the `prefers-reduced-motion` media query.

Because the default is `'on'`, a Mac with "Reduce motion" enabled still gets
animation until the user picks System or Reduced. This was chosen
deliberately; the Settings copy says so.

Wiring:

- `App.tsx` wraps the tree in `<MotionConfig reducedMotion={reduced ? 'always' : 'never'}>`
  and sets `data-motion="reduced"` on `<html>` when reduced.
- CSS under `[data-motion="reduced"]` sets transition and animation durations
  to 0.01ms and stops the `table-skeleton-shimmer` and `pending-border-spin`
  loops. `animate-spin` is exempt because spinners convey loading.
- Under reduced motion `motion` keeps opacity changes and drops transforms and
  layout animation, so overlays still fade rather than snap.
- Toaster and TabsBar replace `useReducedMotion()` from `motion/react` with the
  shared hook so they honour the override.

Settings: a "Motion" row in `SettingsModal` with a three-option `Select`
(On / Match system / Reduced) and one line of help text. `SettingsModal` gains
`motionPreference` and `onChangeMotionPreference` props.

## 4. Overlay primitives

New files in `src/components/ui/`:

- `Modal.tsx` — exports `Modal` (props `isOpen`, `children`, optional
  `className`, `align` (`center` | `top`), `onScrimClick`) which renders the
  scrim with `fade` inside `AnimatePresence`, and `ModalPanel`, a `motion.div`
  with `scaleIn` that replaces each modal's existing panel `div`.
- `Drawer.tsx` — exports `Drawer` (props `isOpen`, `children`, optional
  `scrim`, `onScrimClick`) and `DrawerPanel`, a `motion.aside` with
  `slideInRight`.
- `Popover.tsx` — a `motion.div` applying `popIn` with an `origin` prop, for
  use inside existing portals, wrapped in `AnimatePresence` by the caller.

Escape handling stays in each component as it is today; the primitives do not
add a second listener.

Callers keep their `isOpen` prop. Each migrated component's
`if (!isOpen) return null` is removed and its body rendered as children of the
primitive, so the exit animation can play before unmount.

Migrated to `Modal`: `ConnectionModal`, `SettingsModal`, `EditColumnModal`,
`DeleteColumnModal`, `ConfirmTableActionModal`, `JsonModal`, the inline modal
in `SqlEditorTab`, and `CommandPalette` (`align="top"`).

Migrated to `Drawer`: `PendingChangesDrawer`, `InsertRowDrawer`,
`AddColumnDrawer`, `ActivityLogDrawer`. The `pending-drawer-in` keyframe and
its two class rules are deleted.

Wrapped with `Popover`: `ui/ContextMenu` (including its submenu), `ui/Select`,
`DataExportMenu`, `ColumnVisibilityMenu`, `ForeignKeyFloater`,
`ForeignKeyPicker`, the `FilterExpressionInput` suggestions, and the Navbar
submenu.

### Regression risk

Moving the `return null` changes when component bodies run. For each migrated
file, check:

- Hooks that sat below the early return now run while closed. Any effect that
  assumed "mounted means open" must be gated on `isOpen`.
- State that was reset by unmounting must still reset. Children of the
  primitive unmount after the exit animation, so local state in the body
  component is preserved only if the body is the same component as the caller.
  Each body is extracted into an inner component rendered inside the primitive
  so it mounts and unmounts with the overlay as before.
- Focus returns to the trigger after close.
- Escape and scrim click still close, and do not fire twice.

## 5. Views and navigation

- `WorkspacePanes`: active tab content is wrapped in a `motion.div` keyed by
  tab id using `viewEnter`. It fades in only. There is no exit animation, so
  the outgoing view unmounts immediately as it does today and two heavy views
  (for example two data grids) are never mounted at once.
- `ConnectionPicker`: folders expand and collapse with `collapse`; a single
  chevron rotates over `--motion-fast` instead of swapping icons. The workspace
  `Sidebar` is a flat table list with nothing to collapse; its rows get the
  base hover transition only.
- `UpdateBanner`: enters and leaves with `slideUp`.
- `WorkspaceEmptyState`: `fade` on mount.
- `ui/SplitHandle`: hover and dragging highlight via CSS transition.
- `TabsBar`: tabs get the base hover transition; the existing indicator
  animation is kept and moved onto shared constants.

## 6. Micro-interactions

- Press: `active:scale-[0.98]` on buttons only, applied through a `.pressable`
  utility defined once in `index.css`. Not applied to grid rows, tabs or
  sidebar items.
- Focus ring: fades in through the base transition on `box-shadow` and
  `outline-color`.
- `ui/Switch`: thumb slides over `--motion-fast`. `ui/Checkbox`: check mark
  fades and scales in.
- Form validation messages: fade in with a 2px upward slide.
- `QueryResultsView`: crossfade between skeleton, results and error states.
- `TableDataGrid`: row hover and selection colour transitions at
  `--motion-fast`. No row enter, exit or layout animation; the grid can hold
  thousands of cells and must not pay per-row animation cost.

## Out of scope

- `apps/web`.
- Row or cell enter/layout animation in the data grid.
- Animating ERD node layout in `InteractiveErd` (already pointer-driven).
- CodeMirror internals.
- Page-level route transitions; the app has no router.

## Testing

Unit tests, written before the implementation (`bun test`):

- `motionPreference.test.ts`: `resolveReducedMotion` for all six
  combinations; default is `'on'` when storage is empty or holds an invalid
  value; round-trip of a stored value.
- `motion.test.ts`: exit duration is 75% of enter for each variant; JS
  durations match the CSS tokens in `index.css`.

Checks that must pass: `tsc --noEmit`, existing `bun test` suite.

Manual pass in the running app, in both On and Reduced:

- Every overlay in section 4: open, close by button, Escape and scrim click;
  focus returns to the trigger; reopening shows fresh state.
- Tab switch, pane split, sidebar expand/collapse, update banner.
- Run a query: loading → results, and loading → error.
- Scroll a large table and confirm no dropped frames from row transitions.
- Toggle the Motion setting and confirm it applies without a restart and
  survives a restart.

## Delivery

Four commits, each independently reviewable and revertible:

1. Tokens, `motion.ts`, `motionPreference.ts`, Settings control, root wiring,
   reduced-motion CSS.
2. `Modal`, `Drawer`, `Popover` and migration of all overlays.
3. Views and navigation (section 5).
4. Micro-interactions (section 6).
