export type ToastKind = 'default' | 'success' | 'error';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

export type ToastListener = (toasts: Toast[]) => void;

let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<ToastListener>();

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string): void {
  const next = toasts.filter((item) => item.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function clearToasts(): void {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}

export function toast(
  message: string,
  kind: ToastKind = 'success',
  durationMs = 2400
): string {
  const id = `toast_${++seq}`;
  toasts = [...toasts, { id, message, kind }];
  emit();
  if (durationMs > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

toast.success = (message: string, durationMs?: number) => toast(message, 'success', durationMs);
toast.error = (message: string, durationMs?: number) => toast(message, 'error', durationMs);
