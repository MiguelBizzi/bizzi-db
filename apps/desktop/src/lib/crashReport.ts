import { logClientError } from '@db/core';

export function crashMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  if (error === undefined || error === null) return 'Unknown error';
  if (typeof error === 'string') return error;
  try {
    const json = JSON.stringify(error);
    if (json !== undefined) return json;
  } catch {
    // Cyclic or BigInt-holding values fall through to String().
  }
  return String(error);
}

export function crashDetails(error: unknown, componentStack?: string | null): string {
  const message = crashMessage(error);
  const stack = error instanceof Error ? error.stack?.trim() : undefined;
  const parts = [stack && stack.startsWith(message) ? stack : [message, stack].filter(Boolean).join('\n')];
  if (componentStack?.trim()) parts.push(`Component stack:${componentStack}`);
  return parts.join('\n\n');
}

/**
 * Release builds have no devtools, so the console alone leaves no trace of a crash.
 * The Rust side appends it to the app log; outside Tauri (tests, plain browser) that call fails quietly.
 */
export function reportCrash(source: string, error: unknown, componentStack?: string | null): void {
  const details = crashDetails(error, componentStack);
  console.error(`[${source}]`, details);
  logClientError(source, details).catch(() => {});
}
