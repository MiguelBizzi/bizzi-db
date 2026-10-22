import { windowMenuSetVisible } from '@db/core';
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
    tracker.keyDown(e.key);
    if (decideKeydown(e, opts.platform, opts.run) !== 'pass') e.preventDefault();
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
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousedown', onMouseDown);
    target.removeEventListener('mouseup', onMouseUp);
    target.removeEventListener('blur', onBlur);
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
    let uninstallKeyboard: (() => void) | null = null;
    // Refs survive StrictMode's effect re-run, so the second run reuses the first install.
    if (!installRef.current) {
      const platform = currentPlatform();
      installRef.current = installMenu({
        model: adaptMenuModel(buildMenuModel(), platform),
        platform,
        onRun: menu.run,
      });
    }
    void installRef.current.then((host) => {
      if (!active || !host) return;
      menu.setHost(host);
      menu.sync();
      const platform = currentPlatform();
      if (platform === 'macos') return;
      let visible = false;
      const setVisible = (next: boolean) => {
        visible = next;
        windowMenuSetVisible(next).catch((error) => console.error('Failed to toggle the menu bar', error));
      };
      setVisible(false);
      uninstallKeyboard = installKeyboard({
        platform,
        target: window,
        run: menu.run,
        onAltTap: () => setVisible(!visible),
      });
    });
    return () => {
      active = false;
      uninstallKeyboard?.();
      menu.setHost(null);
    };
  }, [menu]);
}
