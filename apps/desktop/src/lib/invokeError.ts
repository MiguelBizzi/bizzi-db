const FALLBACK = 'Execution error';

export function invokeErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || fallback;
  }
  if (err instanceof Error) {
    const trimmed = err.message.trim();
    return trimmed || fallback;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}
