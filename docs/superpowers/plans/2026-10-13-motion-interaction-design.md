# Motion and Interaction Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Bizzi DB desktop app one consistent motion language: animated overlays, eased popovers, view fade-in, and hover/press/focus feedback, with a user-controllable reduced-motion mode.

**Architecture:** CSS tokens in `index.css` drive hover, press and focus. A `lib/motion.ts` module holds the same numbers plus named `motion` variants. Three primitives in `components/ui/` (`Modal`, `Drawer`, `Popover`) own enter/exit animation, and every overlay migrates onto them. A small preference store decides whether motion is reduced and feeds both `MotionConfig` and a `data-motion` attribute on `<html>`.

**Tech Stack:** React 19, Tailwind CSS v4, `motion` v12 (`motion/react`, already installed), Bun test runner, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-13-motion-interaction-design.md`

## Before starting

- `apps/desktop/src/App.tsx`, `README.md`, `apps/desktop/src/lib/appUpdate.ts` and its test have uncommitted changes on `main` that are not part of this work. They must be committed or stashed by the owner before Task 2, which edits `App.tsx`. Do not include them in any commit from this plan.
- Work on a branch named `feat/motion-design`.
- All paths below are relative to `apps/desktop/` unless they start with `docs/`.
- Run tests from `apps/desktop/`: `bun test <path>`. Type check: `bun run lint`.

## Global Constraints

- Scope is `apps/desktop` only. Do not edit `apps/web`.
- No new dependencies. Import from `motion/react`.
- Durations: fast 120ms, base 180ms, slow 240ms. No animation longer than 240ms.
- Exit duration is 75% of the matching enter duration.
- Easing: enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit `cubic-bezier(0.4, 0, 1, 1)`.
- Variant keys are always `initial`, `animate`, `exit`.
- Motion preference values are `'on' | 'system' | 'reduced'`; default `'on'`; storage key `bizzi.motion`.
- No row, cell or layout animation in `TableDataGrid`. Colour transitions only.
- No animation inside `InteractiveErd` node layout or CodeMirror.
- Repo rule (`.cursor/rules/tdd-testing.mdc`): test extracted logic with `bun:test`, test file beside the unit, no component mounting, no E2E.
- No behaviour changes. `bun test` and `bun run lint` pass at the end of every task.

## Review Focus

No test in this repo can mount components, so items 1–4 are pinned by manual checks in the owning task; item 5 has a unit test.

1. Closing an overlay and reopening it before the exit finishes: it must reopen with fresh state and not get stuck invisible. (Tasks 3, 4)
2. Escape pressed, or the scrim clicked, during an exit animation: `onClose` may fire twice and must be harmless; the scrim must not block clicks on the app behind it while fading out. (Tasks 3, 4)
3. Overlays whose props become `null` on close (`ConfirmTableActionModal`, `EditColumnModal`, `DeleteColumnModal`, `ForeignKeyFloater`): the exiting content must keep rendering its last values and must not throw. (Tasks 3, 5)
4. A context menu opened at the right or bottom edge of the window: it must stay fully on screen even though it starts at scale 0.96. (Task 5)
5. `localStorage` holding an unknown value, or throwing on read or write: the preference falls back to `'on'` and the app still starts. (Task 2)

---

### Task 1: Motion tokens and constants

**Files:**
- Create: `src/lib/motion.ts`
- Create: `src/lib/motion.test.ts`
- Modify: `src/index.css` (`:root` block, `@theme inline` block, `@layer base` block)

**Interfaces:**
- Produces, from `src/lib/motion.ts`:

```ts
import type { Transition, Variants } from 'motion/react';

export const DURATION: { readonly fast: 0.12; readonly base: 0.18; readonly slow: 0.24 };
export const EASE_OUT: readonly [0.16, 1, 0.3, 1];
export const EASE_IN: readonly [0.4, 0, 1, 1];
export const EXIT_RATIO: 0.75;
export function enterTransition(duration: number): Transition; // { duration, ease: EASE_OUT }
export function exitTransition(duration: number): Transition;  // { duration: duration * EXIT_RATIO, ease: EASE_IN }

export const fade: Variants;          // opacity 0 → 1, base
export const scaleIn: Variants;       // opacity 0 → 1, scale 0.97 → 1, base
export const slideInRight: Variants;  // opacity 0 → 1, x 24 → 0, slow
export const slideUp: Variants;       // opacity 0 → 1, y 8 → 0, base
export const viewEnter: Variants;     // opacity 0 → 1, fast; no `exit` key
export const collapse: Variants;      // height 0 ↔ 'auto', opacity 0 ↔ 1, slow
export type PopOrigin = 'top' | 'bottom' | 'left' | 'right';
export function popIn(origin: PopOrigin): Variants; // opacity, scale 0.96 → 1, 4px offset, base
```

  Each variant's `animate` carries `transition: enterTransition(d)` and its `exit` carries `transition: exitTransition(d)`. `popIn` offsets away from the trigger: origin `top` starts at `y: -4`, `bottom` at `y: 4`, `left` at `x: -4`, `right` at `x: 4`.

- Produces, in CSS: custom properties `--motion-fast`, `--motion-base`, `--motion-slow`, `--ease-out`, `--ease-in`.

- [ ] **Step 1: Write the failing tests in `src/lib/motion.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  DURATION, EASE_IN, EASE_OUT, EXIT_RATIO,
  collapse, enterTransition, exitTransition,
  fade, popIn, scaleIn, slideInRight, slideUp, viewEnter,
} from './motion';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const token = (name: string) =>
  css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

describe('motion constants', () => {
  test('durations match the spec', () => {
    expect(DURATION).toEqual({ fast: 0.12, base: 0.18, slow: 0.24 });
    expect(EXIT_RATIO).toBe(0.75);
  });

  test('CSS tokens hold the same values', () => {
    expect(token('--motion-fast')).toBe('120ms');
    expect(token('--motion-base')).toBe('180ms');
    expect(token('--motion-slow')).toBe('240ms');
    expect(token('--ease-out')).toBe(`cubic-bezier(${EASE_OUT.join(', ')})`);
    expect(token('--ease-in')).toBe(`cubic-bezier(${EASE_IN.join(', ')})`);
  });

  test('exit runs at 75% of enter with the exit easing', () => {
    expect(enterTransition(0.18)).toEqual({ duration: 0.18, ease: EASE_OUT });
    expect(exitTransition(0.24)).toEqual({ duration: 0.18, ease: EASE_IN });
  });
});

describe('motion variants', () => {
  const withExit = { fade, scaleIn, slideInRight, slideUp, collapse, popInTop: popIn('top') };

  test.each(Object.entries(withExit))('%s defines initial, animate and exit', (_, v) => {
    expect(Object.keys(v).sort()).toEqual(['animate', 'exit', 'initial']);
  });

  test('viewEnter has no exit', () => {
    expect(Object.keys(viewEnter).sort()).toEqual(['animate', 'initial']);
  });

  test('nothing is longer than 240ms', () => {
    for (const v of [...Object.values(withExit), viewEnter]) {
      const d = (v.animate as { transition: { duration: number } }).transition.duration;
      expect(d).toBeLessThanOrEqual(0.24);
    }
  });

  test('popIn offsets away from the trigger side', () => {
    expect(popIn('top').initial).toMatchObject({ y: -4, scale: 0.96, opacity: 0 });
    expect(popIn('bottom').initial).toMatchObject({ y: 4 });
    expect(popIn('left').initial).toMatchObject({ x: -4 });
    expect(popIn('right').initial).toMatchObject({ x: 4 });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/lib/motion.test.ts`
Expected: FAIL, cannot find module `./motion`.

- [ ] **Step 3: Implement `src/lib/motion.ts`** to the interface above.

- [ ] **Step 4: Add tokens to `src/index.css`**

In `:root` (not `.dark`; the values are theme-independent):

```css
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
```

In `@theme inline`, so every existing `transition-colors` / `transition-transform` utility picks up the shared timing:

```css
  --default-transition-duration: 120ms;
  --default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
```

In `@layer base`, a default transition for interactive elements that have no transition utility:

```css
  button,
  a,
  input,
  textarea,
  select,
  [role="button"],
  [role="menuitem"],
  [role="tab"],
  [role="option"],
  [role="switch"],
  [role="checkbox"] {
    transition-property: color, background-color, border-color, box-shadow, opacity, outline-color;
    transition-duration: var(--motion-fast);
    transition-timing-function: var(--ease-out);
  }
```

- [ ] **Step 5: Run tests and type check**

Run: `bun test src/lib/motion.test.ts && bun run lint`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/motion.ts src/lib/motion.test.ts src/index.css
git commit -m "feat: add motion tokens and shared variants"
```

---

### Task 2: Motion preference, reduced motion and the Settings control

**Files:**
- Create: `src/lib/motionPreference.ts`
- Create: `src/lib/motionPreference.test.ts`
- Modify: `src/App.tsx` (root `return` near line 1175; `<SettingsModal>` near line 1357)
- Modify: `src/components/Modals/SettingsModal.tsx`
- Modify: `src/components/ui/Toaster.tsx`, `src/components/TabsBar.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `DURATION`, `enterTransition` from Task 1 (Toaster and TabsBar constants move onto them).
- Produces, from `src/lib/motionPreference.ts`:

```ts
export type MotionPreference = 'on' | 'system' | 'reduced';
export const MOTION_PREFERENCE_KEY = 'bizzi.motion';
export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'on';

/** Anything other than the three valid strings returns the default. */
export function parseMotionPreference(raw: unknown): MotionPreference;
export function resolveReducedMotion(pref: MotionPreference, systemPrefersReduced: boolean): boolean;

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** Reads via parseMotionPreference; returns the default if storage is undefined or throws. */
export function loadMotionPreference(storage?: PrefStorage): MotionPreference;
/** Swallows storage errors. */
export function saveMotionPreference(pref: MotionPreference, storage?: PrefStorage): void;

export function getMotionPreference(): MotionPreference;
export function setMotionPreference(pref: MotionPreference): void; // saves, then notifies
export function subscribeMotionPreference(listener: () => void): () => void;

/** React hook. `reduced` reacts to both the store and the OS media query. */
export function useMotionPreference(): {
  preference: MotionPreference;
  reduced: boolean;
  setPreference: (pref: MotionPreference) => void;
};
```

  The store follows the module-level pattern in `src/lib/toast.ts`. `storage` defaults to `globalThis.localStorage` when it exists. The hook uses `useSyncExternalStore` for the store and for `window.matchMedia('(prefers-reduced-motion: reduce)')`.

- [ ] **Step 1: Write the failing tests in `src/lib/motionPreference.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_MOTION_PREFERENCE, MOTION_PREFERENCE_KEY,
  getMotionPreference, loadMotionPreference, parseMotionPreference,
  resolveReducedMotion, saveMotionPreference, setMotionPreference,
  subscribeMotionPreference,
} from './motionPreference';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v; },
  };
};
const broken = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
};

describe('resolveReducedMotion', () => {
  test.each([
    ['on', false, false], ['on', true, false],
    ['reduced', false, true], ['reduced', true, true],
    ['system', false, false], ['system', true, true],
  ] as const)('%s with system=%p → %p', (pref, system, expected) => {
    expect(resolveReducedMotion(pref, system)).toBe(expected);
  });
});

describe('parse / load / save', () => {
  test('default is on', () => {
    expect(DEFAULT_MOTION_PREFERENCE).toBe('on');
    expect(MOTION_PREFERENCE_KEY).toBe('bizzi.motion');
  });

  test.each([null, undefined, '', 'off', 'ON', 42, {}])('invalid %p parses to on', (raw) => {
    expect(parseMotionPreference(raw)).toBe('on');
  });

  test('valid values round-trip through storage', () => {
    const storage = memory();
    for (const pref of ['on', 'system', 'reduced'] as const) {
      saveMotionPreference(pref, storage);
      expect(storage.data['bizzi.motion']).toBe(pref);
      expect(loadMotionPreference(storage)).toBe(pref);
    }
  });

  test('empty, corrupt or throwing storage falls back to on', () => {
    expect(loadMotionPreference(memory())).toBe('on');
    expect(loadMotionPreference(memory({ 'bizzi.motion': 'nope' }))).toBe('on');
    expect(loadMotionPreference(broken)).toBe('on');
    expect(() => saveMotionPreference('reduced', broken)).not.toThrow();
  });
});

describe('store', () => {
  test('set updates the value and notifies until unsubscribed', () => {
    let calls = 0;
    const stop = subscribeMotionPreference(() => { calls += 1; });
    setMotionPreference('reduced');
    expect(getMotionPreference()).toBe('reduced');
    expect(calls).toBe(1);
    stop();
    setMotionPreference('on');
    expect(calls).toBe(1);
    expect(getMotionPreference()).toBe('on');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/lib/motionPreference.test.ts`
Expected: FAIL, cannot find module `./motionPreference`.

- [ ] **Step 3: Implement `src/lib/motionPreference.ts`** to the interface above.

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/motionPreference.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the root in `src/App.tsx`**

Call `useMotionPreference()` in `App`. Wrap the root `<div className="flex flex-col h-screen …">` in `<MotionConfig reducedMotion={reduced ? 'always' : 'never'}>`. Add an effect that sets `document.documentElement.dataset.motion` to `'reduced'` when `reduced` is true and deletes the attribute otherwise. Pass `motionPreference={preference}` and `onChangeMotionPreference={setPreference}` to `<SettingsModal>`.

- [ ] **Step 6: Add the reduced-motion rules to `src/index.css`** (unlayered, at the end of the file)

```css
[data-motion="reduced"] *,
[data-motion="reduced"] *::before,
[data-motion="reduced"] *::after {
  transition-duration: 0.01ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
}
/* Spinners convey loading, so they keep turning. */
[data-motion="reduced"] .animate-spin {
  animation-duration: 1s !important;
  animation-iteration-count: infinite !important;
}
```

- [ ] **Step 7: Add the Settings row in `src/components/Modals/SettingsModal.tsx`**

Add props `motionPreference: MotionPreference` and `onChangeMotionPreference: (pref: MotionPreference) => void`. Insert a block after the keychain warning and before the updates section, matching the keychain block's markup (uppercase 10px label, control, 10px help paragraph):

- Label: `Motion`
- Control: the existing `Select` from `../ui/Select`, `id="settings-motion"`, `size="sm"`, options in this order: `{ value: 'on', label: 'On' }`, `{ value: 'system', label: 'Match system' }`, `{ value: 'reduced', label: 'Reduced' }`.
- Help text, exactly: `Animations are on by default. Choose Match system to follow your operating system's reduce-motion setting, or Reduced to turn most animation off.`

- [ ] **Step 8: Move Toaster and TabsBar onto the shared hook**

In `src/components/ui/Toaster.tsx` and `src/components/TabsBar.tsx`, replace `useReducedMotion()` from `motion/react` with `const { reduced: reduceMotion } = useMotionPreference()`. Replace their local duration/easing literals (`ENTER_EXIT`, `INDICATOR_TRANSITION`) with `enterTransition(DURATION.base)` unless the constant is a spring; leave spring configs unchanged.

- [ ] **Step 9: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Manual, with `bun run dev` from the repo root:
- Settings shows the Motion row with `On` selected on first launch.
- Selecting `Reduced` sets `data-motion="reduced"` on `<html>` immediately; hover colour changes become instant; a toast still fades but no longer slides.
- Quit and relaunch: `Reduced` is still selected.
- Selecting `On` removes the attribute.

- [ ] **Step 10: Commit**

```bash
git add src/lib/motionPreference.ts src/lib/motionPreference.test.ts src/App.tsx src/index.css src/components/Modals/SettingsModal.tsx src/components/ui/Toaster.tsx src/components/TabsBar.tsx
git commit -m "feat: add motion preference with reduced-motion mode"
```

---

### Task 3: `Modal` primitive and modal migration

**Files:**
- Create: `src/components/ui/Modal.tsx`
- Modify: `src/components/Modals/ConnectionModal.tsx`, `src/components/Modals/SettingsModal.tsx`, `src/components/SchemaView/EditColumnModal.tsx`, `src/components/SchemaView/DeleteColumnModal.tsx`, `src/components/SchemaView/ConfirmTableActionModal.tsx`, `src/components/TableView/JsonModal.tsx`, `src/components/CommandPalette.tsx`, `src/components/SqlEditor/SqlEditorTab.tsx` (save-query modal near line 429)

**Interfaces:**
- Consumes: `fade`, `scaleIn` from Task 1.
- Produces, from `src/components/ui/Modal.tsx`:

```tsx
interface ModalProps {
  isOpen: boolean;
  children: React.ReactNode;
  /** Extra classes for the scrim, e.g. 'connection-modal font-sans select-none text-foreground'. */
  className?: string;
  align?: 'center' | 'top'; // default 'center'
  onScrimClick?: () => void;
}
export function Modal(props: ModalProps): JSX.Element;

/** Replaces a modal's panel <div>. Accepts every motion.div prop (className, role, aria-*, onClick, ref). */
export const ModalPanel: React.ForwardRefExoticComponent<HTMLMotionProps<'div'> & React.RefAttributes<HTMLDivElement>>;
```

  `Modal` renders `<AnimatePresence>{isOpen && <motion.div …>{children}</motion.div>}</AnimatePresence>`. The scrim `motion.div` uses `variants={fade}` with `initial="initial" animate="animate" exit="exit"` and base classes `fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-center p-4`, plus `items-center` for `center` or `items-start pt-20` for `top`. It sets `pointer-events: none` in its `exit` state so a fading scrim never blocks the app. `onScrimClick` fires only when `event.target === event.currentTarget`. `ModalPanel` is a `motion.div` with `variants={scaleIn}` and no `initial`/`animate` props, so it inherits the labels from the scrim.

**Migration recipe, applied to each file:**

1. Rename the existing component to `<Name>Body` (not exported) and delete its `if (!isOpen …) return null`. Its props become non-nullable where the early return used to narrow them (`table`, `action`, `column`).
2. In `<Name>Body`'s JSX, delete the outer scrim `div` and change the panel `div` to `ModalPanel`, keeping its classes and ARIA attributes. Scrim-only classes (`connection-modal`, `font-sans select-none text-foreground`) move to `Modal`'s `className`.
3. Export a new `<Name>` with the original props that computes `isOpen` and returns `<Modal isOpen={isOpen} …>{isOpen ? <NameBody {...props} /> : null}</Modal>`. Because `AnimatePresence` keeps the last rendered child during exit, the body keeps its final props while it animates out.
4. Remove effects in the body whose only job was resetting state when `isOpen` became false; the body now unmounts on close. Keep every other effect, including Escape listeners.

Per-file notes:
- `CommandPalette`: `align="top"`, `onScrimClick={onClose}`; drop the panel's `onClick` stop-propagation and its `animate-in fade-in zoom-in-95 duration-150` classes.
- `ConfirmTableActionModal`: `isOpen = Boolean(table && action)`; render the body only when both are non-null.
- `EditColumnModal`, `DeleteColumnModal`: `isOpen && column` gates the body.
- `SqlEditorTab`: replace `{isSaveModalOpen && (<div scrim><div panel>…` with `<Modal isOpen={isSaveModalOpen}><ModalPanel …>…</ModalPanel></Modal>`. No body extraction; the state lives in the tab.
- `JsonModal`: its `useState(formatJson(initialValue))` already relies on mounting fresh per open; the body extraction preserves that.

- [ ] **Step 1: Create `src/components/ui/Modal.tsx`** to the interface above.

- [ ] **Step 2: Migrate `ConfirmTableActionModal` and `SettingsModal` first**, following the recipe.

- [ ] **Step 3: Type check and manual check of those two**

Run: `bun run lint` — expected: exits 0.

Manual (`bun run dev`):
- Settings opens with a fade and slight scale-up, and closes with a visible fade-out.
- Right-click a table → Delete table: opens animated; type part of the name, press Escape; reopen: the input is empty.
- While the delete modal is fading out, the table name and SQL preview are still shown (no blank panel, no console error).
- Press Escape twice quickly: no error, modal closes once.
- Click a sidebar row immediately after closing: the click registers during the fade-out.

- [ ] **Step 4: Migrate the remaining six** (`ConnectionModal`, `EditColumnModal`, `DeleteColumnModal`, `JsonModal`, `CommandPalette`, `SqlEditorTab`).

- [ ] **Step 5: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Run: `grep -rn "fixed inset-0 z-50 bg-background/80" src/components`
Expected: one match, in `src/components/ui/Modal.tsx`.

Manual, for each of the six: open, close by button, close by Escape, reopen and confirm fresh state. Additionally:
- `ConnectionModal`: edit an existing connection, close without saving, open "new connection": fields are empty. Test-connection and save still work.
- `CommandPalette`: Cmd+K toggles; clicking the scrim closes; clicking inside does not; the input is focused on open; pressing Cmd+K during the exit reopens it.
- `JsonModal`: opening on two different cells shows each cell's JSON.
- Repeat one modal with Motion set to `Reduced`: it fades without scaling.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx src/components/Modals src/components/SchemaView src/components/TableView/JsonModal.tsx src/components/CommandPalette.tsx src/components/SqlEditor/SqlEditorTab.tsx
git commit -m "feat: animate modals in and out through a shared Modal primitive"
```

---

### Task 4: `Drawer` primitive and drawer migration

**Files:**
- Create: `src/components/ui/Drawer.tsx`
- Modify: `src/components/PendingChanges/PendingChangesDrawer.tsx`, `src/components/TableView/InsertRowDrawer.tsx`, `src/components/SchemaView/AddColumnDrawer.tsx`, `src/components/ActivityLog/ActivityLogDrawer.tsx`
- Modify: `src/index.css` (delete `@keyframes pending-drawer-in` and the `.pending-changes-drawer, .insert-row-drawer` rule)

**Interfaces:**
- Consumes: `fade`, `slideInRight` from Task 1.
- Produces, from `src/components/ui/Drawer.tsx`:

```tsx
interface DrawerProps {
  isOpen: boolean;
  children: React.ReactNode;
  scrim?: boolean;          // default true
  onScrimClick?: () => void;
}
export function Drawer(props: DrawerProps): JSX.Element;

/** Replaces a drawer's <aside>/<div> panel. Accepts every motion.aside prop. */
export const DrawerPanel: React.ForwardRefExoticComponent<HTMLMotionProps<'aside'> & React.RefAttributes<HTMLElement>>;
```

  `Drawer` renders, inside `AnimatePresence`, a wrapper `motion.div` with `initial="initial" animate="animate" exit="exit"` and classes `fixed inset-0 z-40 pointer-events-none`. The wrapper has no variants of its own; it only propagates the labels. When `scrim` is true it renders a child `motion.div` with `variants={fade}` and classes `absolute inset-0 bg-background/50 backdrop-blur-[2px] pointer-events-auto`, with `pointer-events: none` in its `exit` state. `DrawerPanel` is a `motion.aside` with `variants={slideInRight}` and `pointer-events-auto` appended to its `className`.

- [ ] **Step 1: Create `src/components/ui/Drawer.tsx`** to the interface above.

- [ ] **Step 2: Migrate the four drawers** using the Task 3 recipe with `Drawer`/`DrawerPanel`. Per-file notes:
  - `PendingChangesDrawer`: the `if (!isOpen) { setArmed(null); setMode('visual'); return; }` branch of its effect is removed (the body unmounts); keep the Escape listener. Pass `onScrimClick={onClose}`. Drop the `pending-changes-drawer` class.
  - `InsertRowDrawer`, `AddColumnDrawer`: pass `onScrimClick` matching each one's current scrim `onClick`. Drop the `insert-row-drawer` class.
  - `ActivityLogDrawer`: `scrim={false}` (it has none today). No body extraction needed; it has no state.
  - Panels keep `fixed inset-y-0 right-0` and their width classes; change `z-50` to nothing (the wrapper sets the layer).

- [ ] **Step 3: Delete the old keyframes** from `src/index.css`: the `@keyframes pending-drawer-in` block and the `.pending-changes-drawer, .insert-row-drawer { animation: … }` rule.

- [ ] **Step 4: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Run: `grep -rn "pending-drawer-in\|insert-row-drawer\|pending-changes-drawer" src`
Expected: no matches.

Manual:
- Each drawer slides in from the right and slides back out; the scrim fades both ways.
- Pending Changes: arm an "apply" confirmation, close, reopen: it is no longer armed and the mode is back to visual.
- Insert Row: type into a field, close, reopen: fields are empty. Submitting a row still works.
- Activity Log: the app behind it remains clickable while it is open (no scrim).
- Opening Activity Log from the command palette while Pending Changes is open swaps them without overlap glitches.
- With Motion `Reduced`: drawers fade without sliding.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Drawer.tsx src/components/PendingChanges src/components/TableView/InsertRowDrawer.tsx src/components/SchemaView/AddColumnDrawer.tsx src/components/ActivityLog src/index.css
git commit -m "feat: animate drawers in and out through a shared Drawer primitive"
```

---

### Task 5: `Popover` primitive, menus and floating panels

**Files:**
- Create: `src/components/ui/Popover.tsx`
- Modify: `src/components/ui/ContextMenu.tsx`, `src/components/ui/Select.tsx`, `src/components/DataExport/DataExportMenu.tsx`, `src/components/TableView/ColumnVisibilityMenu.tsx`, `src/components/TableView/ForeignKeyPicker.tsx`, `src/components/TableView/ForeignKeyFloater.tsx`, `src/components/TableView/FilterExpressionInput.tsx`, `src/components/Navbar.tsx`
- Modify the four `<ContextMenu>` call sites: `src/components/TableView/TableDataGrid.tsx:889`, `src/components/TabsBar.tsx:472`, `src/components/Sidebar.tsx:302`, `src/components/ConnectionPicker.tsx:712`; and the `<ForeignKeyFloater>` call site at `src/components/TableView/TableDataGrid.tsx:871`

**Interfaces:**
- Consumes: `popIn`, `PopOrigin` from Task 1.
- Produces, from `src/components/ui/Popover.tsx`:

```tsx
interface PopoverProps extends HTMLMotionProps<'div'> {
  /** Side of the popover that touches its trigger. Default 'top' (opens downward). */
  origin?: PopOrigin;
}
export const Popover: React.ForwardRefExoticComponent<PopoverProps & React.RefAttributes<HTMLDivElement>>;
```

  A `motion.div` with `variants={popIn(origin)}`, `initial="initial" animate="animate" exit="exit"`, and `style.transformOrigin` set to the `origin` side merged with any caller `style`. It does not render `AnimatePresence`; the caller does.

**Recipe:** where a component renders `{open && (<div menu …>)}`, change it to `<AnimatePresence>{open && (<Popover …>)}</AnimatePresence>`, keeping classes, refs, roles and inline positioning styles. Inside a `createPortal`, the `AnimatePresence` goes inside the portal call and the portal renders unconditionally.

Per-file notes:
- `Select`: `origin` is `'bottom'` when `placement === 'top'`, otherwise `'top'`. The portal condition `open && menuBox` moves inside `AnimatePresence`.
- `ContextMenu`: root panel becomes `Popover origin="top"` with `style.transformOrigin: 'top left'`. Its clamping effect must measure with `el.offsetWidth` / `el.offsetHeight` instead of `getBoundingClientRect()`, because the rect is scaled to 0.96 during entry. Its submenu (`role="menu"` near line 146) becomes `Popover origin="left"`, or `"right"` when `flip` is true, wrapped in `AnimatePresence`.
- The four `{menu && <ContextMenu … />}` call sites wrap in `<AnimatePresence>` so the menu can exit. Give each `ContextMenu` a `key` built from its coordinates (`` `${menu.x}:${menu.y}` ``) so right-clicking elsewhere replaces the menu instead of sliding it.
- `ForeignKeyFloater`: root becomes `Popover`; its call site wraps in `AnimatePresence`. If its position effect measures its own rect, switch that to `offsetWidth` / `offsetHeight` for the same reason as `ContextMenu`.
- `Navbar`: both the submenu near line 78 (`origin="left"`) and the switcher menu near line 184 (`origin="top"`).
- `FilterExpressionInput`: the gate is `showMenu`, not `open`.

- [ ] **Step 1: Create `src/components/ui/Popover.tsx`** to the interface above.

- [ ] **Step 2: Migrate `Select` and `ContextMenu` (with its four call sites).**

- [ ] **Step 3: Type check and manual check of those two**

Run: `bun run lint` — expected: exits 0.

Manual:
- A `Select` (for example the Motion setting) opens with a short scale/fade from the trigger edge and closes with a fade. Keyboard selection and search still work.
- Right-click a table row near the bottom-right corner of the window: the menu is fully on screen.
- Right-click one tab, then right-click another without dismissing: the first menu disappears and a new one appears at the new position.
- Hover a context menu item with a submenu: it opens to the side, and flips when near the right edge.
- Escape and outside-click close the menu; scrolling closes it.

- [ ] **Step 4: Migrate the remaining six** (`DataExportMenu`, `ColumnVisibilityMenu`, `ForeignKeyPicker`, `ForeignKeyFloater`, `FilterExpressionInput`, `Navbar`).

- [ ] **Step 5: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Manual, for each of the six: opens animated, closes animated, outside click and Escape still close it, and its primary action works (export, toggle a column, pick a foreign key, follow a foreign key floater link, accept a filter completion, switch connection). For `ForeignKeyFloater`, close it and confirm the content stays visible while it fades.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src/components/DataExport src/components/TableView src/components/Navbar.tsx src/components/TabsBar.tsx src/components/Sidebar.tsx src/components/ConnectionPicker.tsx
git commit -m "feat: animate menus and popovers through a shared Popover primitive"
```

---

### Task 6: Views and navigation

**Files:**
- Modify: `src/components/WorkspacePanes.tsx` (`LeafPane`, the content `div` near line 112)
- Modify: `src/components/ConnectionPicker.tsx` (folder header near line 551, folder body near line 683)
- Modify: `src/components/UpdateBanner.tsx`, and its mount in `src/App.tsx` near line 1367
- Modify: `src/components/WorkspaceEmptyState.tsx`
- Modify: `src/components/ui/SplitHandle.tsx` (line 62)

**Interfaces:**
- Consumes: `viewEnter`, `collapse`, `slideUp`, `fade` from Task 1.
- Produces: nothing used by later tasks.

- [ ] **Step 1: Fade pane content in on tab change (`WorkspacePanes.tsx`)**

Inside the existing `flex-1 min-h-0 overflow-hidden relative` container, wrap the active content in `<motion.div key={activeTab?.id ?? 'empty'} variants={viewEnter} initial="initial" animate="animate" className="w-full h-full">`. Do not add `AnimatePresence`: the outgoing view must unmount immediately so two views are never mounted together. The wrapper must not set `transform`, because `TableDataGrid` uses sticky headers and `position: fixed` thumbs inside it.

- [ ] **Step 2: Animate connection folders (`ConnectionPicker.tsx`)**

Replace the `expanded ? <ChevronDown/> : <ChevronRight/>` swap with a single `ChevronRight` that has `transition-transform` and `rotate-90` when expanded. Change `{expanded && (…)}` to `<AnimatePresence initial={false}>{expanded && (<motion.div variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">…</motion.div>)}</AnimatePresence>`. The `motion.div` wraps the existing folder body; if the body is table rows, wrap at whatever level keeps valid HTML and say so in the commit message.

- [ ] **Step 3: Animate the update banner**

In `UpdateBanner.tsx`, change both root `div`s (error and ready states) to `motion.div` with `variants={slideUp}` and `initial="initial" animate="animate" exit="exit"`. In `App.tsx`, wrap the conditional `<UpdateBanner>` in `<AnimatePresence>`.

- [ ] **Step 4: Fade in the empty state (`WorkspaceEmptyState.tsx`)**

No change needed beyond Step 1, which already fades it under the `'empty'` key. Confirm and leave the file untouched; if it is rendered anywhere else, give that root `variants={fade}` with `initial`/`animate`.

- [ ] **Step 5: Split handle feedback (`SplitHandle.tsx`)**

Add `transition-colors` to the handle's class list at line 62 so the existing `hover:bg-primary/60 active:bg-primary` change eases.

- [ ] **Step 6: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Manual:
- Switching tabs fades the new view in; nothing blanks or flashes white; the tab indicator still slides.
- Open a large table, switch away and back: scroll position behaviour is unchanged from `main`, the sticky header stays aligned, and the overlay scrollbar thumb is positioned correctly.
- Split a pane: both panes render; dragging the handle resizes smoothly and the handle highlights on hover and while dragging.
- Collapse and expand a connection folder: height animates, chevron rotates, drag-and-drop of connections into folders still works, and searching still force-expands folders.
- With an update ready (or by temporarily forcing `updateStatus` to an error state in dev), the banner slides up and slides away on Dismiss.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkspacePanes.tsx src/components/ConnectionPicker.tsx src/components/UpdateBanner.tsx src/components/WorkspaceEmptyState.tsx src/components/ui/SplitHandle.tsx src/App.tsx
git commit -m "feat: animate tab content, connection folders and the update banner"
```

---

### Task 7: Micro-interactions

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/ui/Checkbox.tsx`, `src/components/ui/Switch.tsx`
- Modify: `src/components/SqlEditor/QueryResultsView.tsx`
- Modify: `src/components/TableView/TableDataGrid.tsx` (row and cell class strings only)
- Modify: button class strings across `src/components/**` as described in Step 2
- Modify: validation message elements in `src/components/Modals/ConnectionModal.tsx`, `src/components/SchemaView/ColumnDraftFields.tsx`, `src/components/TableView/InsertRowDrawer.tsx`, `src/components/TableView/JsonModal.tsx`

**Interfaces:**
- Consumes: tokens from Task 1, `fade` from Task 1.
- Produces: CSS classes `.pressable` and `.field-message`.

- [ ] **Step 1: Add the utilities to `src/index.css`** (unlayered, so they win over Tailwind's `transition-*` utilities)

```css
.pressable {
  transition-property: color, background-color, border-color, box-shadow, opacity, transform;
  transition-duration: var(--motion-fast);
  transition-timing-function: var(--ease-out);
}
.pressable:not(:disabled):active {
  transform: scale(0.98);
}

@keyframes field-message-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
}
.field-message {
  animation: field-message-in var(--motion-base) var(--ease-out);
}
```

- [ ] **Step 2: Apply `pressable`**

Add the class to buttons that have a visible background or border: primary and secondary action buttons in modal and drawer footers, toolbar buttons in `TableToolbar`, `SqlEditorTab`, `Navbar` and `TableSchemaDesigner`, icon buttons in overlay headers, and shared button class constants such as `BUTTON` in `UpdateBanner.tsx`. Do not add it to: grid rows or cells, tabs in `TabsBar`, sidebar and connection list rows, menu items (`ITEM` in `ContextMenu.tsx`), select options, or `Switch`.

- [ ] **Step 3: Checkbox and Switch**

`Checkbox.tsx`: add `scale-75 transition-[opacity,scale] peer-checked:scale-100` to the `Check` icon so the mark fades and scales in. `Switch.tsx` already has `transition-colors` and `transition-transform`, which now use the shared timing; no change.

- [ ] **Step 4: Validation and error messages**

Add `field-message` to the elements that render conditional validation or error text in the four files listed. These are the elements rendered only when an error string is non-empty; do not add it to static help text.

- [ ] **Step 5: Query results state change (`QueryResultsView.tsx`)**

Wrap the three top-level outcomes (the skeleton returned near line 25, the error block near line 190, and the results body) each in a `motion.div` with `variants={fade}`, `initial="initial" animate="animate"` and a distinct `key` (`'loading'`, `'error'`, `'results'`), so each state fades in when it replaces another. No `AnimatePresence`, no exit.

- [ ] **Step 6: Data grid row feedback (`TableDataGrid.tsx`)**

Ensure the row (`<tr>`) and selected-cell class strings include `transition-colors` wherever they change background on hover or selection. Add nothing else: no `motion` components, no transforms, no `pressable`.

- [ ] **Step 7: Verify**

Run: `bun test && bun run lint`
Expected: PASS, `tsc` exits 0.

Run: `grep -n "motion\." src/components/TableView/TableDataGrid.tsx`
Expected: no matches.

Manual:
- Action buttons compress slightly on press and release smoothly; rows, tabs and menu items do not.
- Tab through a form: focus rings ease in.
- Toggle a checkbox and a switch: the check and thumb animate.
- Submit the connection form with a missing host: the error text fades in.
- Run a query: skeleton → results fades; run an invalid query: the error fades in.
- Scroll a table with at least 1,000 rows quickly with the mouse over it: scrolling is as smooth as on `main`.
- Set Motion to `Reduced` and repeat the press, checkbox and query checks: no movement, state changes are instant or a plain fade, and query spinners still spin.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: add press, focus, validation and result-state feedback"
```

---

### Task 8: Final verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full automated suite**

Run from the repo root: `bun run lint && bun run test`
Expected: both exit 0.

- [ ] **Step 2: Scope check**

Run: `git diff --stat main...HEAD -- apps/web`
Expected: no output.

Run: `git diff main...HEAD -- apps/desktop/package.json bun.lock`
Expected: no output (no new dependencies).

- [ ] **Step 3: Consistency sweep**

Run: `grep -rnE "duration-(75|100|150|200|300|500|700|1000)|ease-(in|out|in-out)\b|animate-in|zoom-in|fade-in" apps/desktop/src`
Expected: no matches. Remove any leftover per-component timing so everything uses the shared defaults.

- [ ] **Step 4: Full manual pass**

With `bun run dev`, walk the spec's Testing section once with Motion `On` and once with `Reduced`: every overlay from Tasks 3–5 (open, button close, Escape, scrim click, reopen), tab switch, pane split, folder collapse, query run to results and to error, large-table scroll, and the Motion setting surviving a restart.

- [ ] **Step 5: Commit any fixes**

```bash
git add apps/desktop/src
git commit -m "fix: remove leftover per-component motion timing"
```

Skip this step if Steps 1–4 required no changes.
