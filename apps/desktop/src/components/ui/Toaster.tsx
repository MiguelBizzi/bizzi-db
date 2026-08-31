import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, CircleAlert } from 'lucide-react';
import { dismissToast, subscribeToasts, type Toast } from '../../lib/toast';

const ENTER_EXIT = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1] as const,
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => subscribeToasts(setToasts), []);

  if (typeof document === 'undefined') return null;

  const transition = reduceMotion ? { duration: 0 } : ENTER_EXIT;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[300] flex flex-col-reverse gap-2 w-[min(20rem,calc(100vw-2rem))] pointer-events-none">
      <AnimatePresence>
        {toasts.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
            transition={transition}
            onClick={() => dismissToast(item.id)}
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5 text-left text-xs text-popover-foreground shadow-2xl"
          >
            {item.kind === 'error' ? (
              <CircleAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="min-w-0 truncate">{item.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
