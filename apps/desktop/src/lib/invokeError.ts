const FALLBACK = 'Execution error';

export function invokeErrorMessage(err: unknown): string {
  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || FALLBACK;
  }
  if (err instanceof Error) {
    const trimmed = err.message.trim();
    return trimmed || FALLBACK;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return FALLBACK;
}
