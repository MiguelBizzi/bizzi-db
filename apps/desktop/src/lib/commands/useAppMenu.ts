import { useEffect, useRef } from 'react';
import { invokeErrorMessage } from '../invokeError';
import { toast } from '../toast';
import { getLocalContext, registerScope, runCommand, subscribeBus, type CommandHandler } from './commandBus';
import { createAltTapTracker } from './altTap';
import { isTextInputTarget, type CommandContext } from './context';
import { decideKeydown, isNavigationMouseButton } from './keyboard';
import { installMenu, type MenuHost } from './menuHost';
import { buildMenuModel } from './menuModel';
import type { Platform } from './accelerator';
import { adaptMenuModel } from './platformAdapter';
import { menuState } from './registry';
import { currentPlatform } from './shortcutLabel';

type MenuState = ReturnType<typeof menuState>;

export interface MenuSync {
  setHost(host: MenuHost | null): void;
  /** Recomputes the menu state from `getContext()` and queues it on the host. */
  sync(): void;
  /**
   * Menu click entry point. Re-syncs first, so the gate sees the current context (a typing
   * flag can go stale when a focused input leaves the DOM without a focusout), then ignores
   * the command when it is disabled. Returns whether the command ran.
   */
  run(commandId: string): boolean;
  /** Resolves once every queued `applyState` has settled. */
  idle(): Promise<void>;
}

/**
 * The context the menu gates on: local scope context over the app context, plus typing focus.
 * `modalOpen` is OR-ed: a component overlay (local) and an app-level modal each count, and a
 * scope publishing `modalOpen: false` must not clear the app's `true`.
 */
export function mergeMenuContext(
  app: CommandContext,
  local: Partial<CommandContext>,
  textInputFocused: boolean,
): CommandContext {
  return { ...app, ...local, modalOpen: app.modalOpen || Boolean(local.modalOpen), textInputFocused };
}

/** React-free core of `useAppMenu`. Only reads the bus; never writes to it. */
export function createMenuSync(opts: {
  getContext: () => CommandContext;
  onError: (error: unknown) => void;
}): MenuSync {
  let host: MenuHost | null = null;
  let latest: MenuState | null = null;
  // `applyState` diffs against a cache it updates as it goes, so calls must not overlap.
  let chain: Promise<void> = Promise.resolve();

  const sync = () => {
    const state = menuState(opts.getContext());
    latest = state;
    const target = host;
    if (!target) return;
    chain = chain.then(() => target.applyState(state)).catch(() => undefined);
  };

  return {
    setHost(next) {
      host = next;
    },
    sync,
    run(commandId) {
      sync();
      if (!latest?.enabled[commandId]) return false;
      return runCommand(commandId, opts.onError);
    },
    idle: () => chain,
  };
}

/**
 * Off macOS the menu has no registered accelerators, so shortcuts are dispatched here through
 * the menu's enable gate. Also swallows webview browser shortcuts and mouse back/forward, and
 * reports a lone Alt tap. Returns the uninstall function.
 */
export function installKeyboard(opts: {
  platform: Platform;
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  run(commandId: string): boolean;
  onAltTap(): void;
}): () => void {
  const { target } = opts;
  const tracker = createAltTapTracker();
  const onKeyDown = (e: KeyboardEvent) => {
    // A dispatcher bug must never stop keys from reaching the focused input.
    try {
      tracker.keyDown(e.key);
      if (decideKeydown(e, opts.platform, opts.run) !== 'pass') e.preventDefault();
    } catch (error) {
      console.error('Keyboard shortcut dispatch failed', error);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (tracker.keyUp(e.key)) opts.onAltTap();
  };
  const onMouseDown = (e: MouseEvent) => {
    tracker.interrupt();
    if (isNavigationMouseButton(e.button)) e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent) => {
    if (isNavigationMouseButton(e.button)) e.preventDefault();
  };
  const onBlur = () => tracker.reset();
  // Capture phase: components that stopPropagation on clicks must not hide them from the
  // Alt tracker or the navigation-button suppression.
  const capture = { capture: true };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown, capture);
  target.addEventListener('mouseup', onMouseUp, capture);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousedown', onMouseDown, capture);
    target.removeEventListener('mouseup', onMouseUp, capture);
    target.removeEventListener('blur', onBlur);
  };
}

/**
 * Off macOS: shortcuts dispatch from the start, independent of the native menu; an Alt tap
 * pops the menu up once `setHost` provides one and is ignored until then.
 */
export function installMenuKeyboard(opts: {
  platform: Platform;
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  run(commandId: string): boolean;
}): { setHost(host: MenuHost | null): void; dispose(): void } {
  let host: MenuHost | null = null;
  const dispose = installKeyboard({
    ...opts,
    onAltTap: () => {
      host?.popup?.().catch((error) => console.error('Failed to open the menu', error));
    },
  });
  return {
    setHost(next) {
      host = next;
    },
    dispose,
  };
}

/**
 * Installs the native menu once, registers `handlers` as the 'app' command scope, and keeps
 * item enablement in sync with `context`, local scope context and text-input focus.
 * `handlers` may be a fresh object every render; the set of command ids is fixed at mount.
 */
export function useAppMenu(args: { context: CommandContext; handlers: Record<string, CommandHandler> }): void {
  const handlersRef = useRef(args.handlers);
  handlersRef.current = args.handlers;
  const contextRef = useRef(args.context);
  contextRef.current = args.context;
  const installRef = useRef<Promise<MenuHost | null> | null>(null);
  const menuRef = useRef<MenuSync | null>(null);
  if (!menuRef.current) {
    menuRef.current = createMenuSync({
      getContext: () =>
        mergeMenuContext(
          contextRef.current,
          getLocalContext(),
          // Read live rather than from focus events, which miss an input removed while focused.
          isTextInputTarget(document.activeElement),
        ),
      onError: (error) => toast.error(invokeErrorMessage(error, 'Command failed')),
    });
  }
  const menu = menuRef.current;

  useEffect(() => {
    const wrappers: Record<string, CommandHandler> = {};
    for (const id of Object.keys(handlersRef.current)) {
      wrappers[id] = () => handlersRef.current[id]?.();
    }
    const scope = registerScope('app', wrappers);
    return () => scope.dispose();
  }, []);

  useEffect(() => subscribeBus(menu.sync), [menu]);

  useEffect(() => {
    const update = () => menu.sync();
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [menu]);

  useEffect(() => {
    menu.sync();
  }, [args.context, menu]);

  useEffect(() => {
    let active = true;
    const platform = currentPlatform();
    // Refs survive StrictMode's effect re-run, so the second run reuses the first install.
    if (!installRef.current) {
      installRef.current = installMenu({
        model: adaptMenuModel(buildMenuModel(), platform),
        platform,
        onRun: menu.run,
      });
    }
    const keys = platform === 'macos' ? null : installMenuKeyboard({ platform, target: window, run: menu.run });
    void installRef.current.then((host) => {
      if (!active || !host) return;
      menu.setHost(host);
      menu.sync();
      keys?.setHost(host);
    });
    return () => {
      active = false;
      keys?.dispose();
      menu.setHost(null);
    };
  }, [menu]);
}
