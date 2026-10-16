import type { CommandContext } from './context';

export type CommandHandler = () => void | Promise<void>;

export interface CommandScope {
  /** Makes the scope active and the topmost one. */
  claim(): void;
  /**
   * Inactive scopes lose to active ones in command lookup and contribute no context.
   * Scopes start active.
   */
  setActive(active: boolean): void;
  setContext(patch: Partial<CommandContext>): void;
  dispose(): void;
}

interface ScopeEntry {
  owner: string;
  handlers: Record<string, CommandHandler>;
  patch: Partial<CommandContext>;
  active: boolean;
}

// Ordered bottom to top; the last entry is the most recently registered or claimed.
let stack: ScopeEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken listener must not affect other listeners or the bus operation.
    }
  }
}

export function registerScope(
  owner: string,
  handlers: Record<string, CommandHandler>,
): CommandScope {
  const entry: ScopeEntry = { owner, handlers, patch: {}, active: true };
  stack.push(entry);
  notify();

  return {
    claim() {
      const index = stack.indexOf(entry);
      if (index === -1) return;
      entry.active = true;
      if (index !== stack.length - 1) {
        stack.splice(index, 1);
        stack.push(entry);
      }
      notify();
    },
    setActive(active) {
      if (!stack.includes(entry) || entry.active === active) return;
      entry.active = active;
      notify();
    },
    setContext(patch) {
      if (!stack.includes(entry)) return;
      entry.patch = { ...entry.patch, ...patch };
      notify();
    },
    dispose() {
      if (!stack.includes(entry)) return;
      stack = stack.filter((e) => e !== entry);
      notify();
    },
  };
}

export function getLocalContext(): Partial<CommandContext> {
  const merged: Partial<CommandContext> = {};
  for (const entry of stack) if (entry.active) Object.assign(merged, entry.patch);
  return merged;
}

export function runCommand(id: string, onError?: (error: unknown) => void): boolean {
  // Active scopes win regardless of mount order; inactive ones are only a fallback.
  let handler: CommandHandler | undefined;
  for (const wantActive of [true, false]) {
    for (let i = stack.length - 1; i >= 0 && !handler; i--) {
      if (stack[i].active === wantActive) handler = stack[i].handlers[id];
    }
    if (handler) break;
  }
  if (!handler) return false;

  const report = (error: unknown) => {
    try {
      onError?.(error);
    } catch {
      // Never rethrow from the command runner.
    }
  };

  try {
    const result = handler();
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).then(undefined, report);
    }
  } catch (error) {
    report(error);
  }
  return true;
}

export function subscribeBus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
