import { useEffect, useRef, useState } from 'react';

export const HOVER_MENU_CLOSE_MS = 180;

export type HoverMenuScheduler = {
  schedule: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
};

export function createHoverMenuController(
  setOpen: (open: boolean) => void,
  scheduler: HoverMenuScheduler,
  delayMs = HOVER_MENU_CLOSE_MS
) {
  let timer: number | null = null;

  const clearTimer = () => {
    if (timer != null) {
      scheduler.cancel(timer);
      timer = null;
    }
  };

  return {
    enter() {
      clearTimer();
      setOpen(true);
    },
    leave() {
      clearTimer();
      timer = scheduler.schedule(() => {
        timer = null;
        setOpen(false);
      }, delayMs);
    },
    dispose() {
      clearTimer();
    },
  };
}

export function useHoverMenu(delayMs = HOVER_MENU_CLOSE_MS) {
  const [open, setOpen] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createHoverMenuController> | null>(
    null
  );
  if (controllerRef.current == null) {
    controllerRef.current = createHoverMenuController(
      setOpen,
      {
        schedule: (fn, ms) => window.setTimeout(fn, ms),
        cancel: (id) => window.clearTimeout(id),
      },
      delayMs
    );
  }

  useEffect(() => () => controllerRef.current?.dispose(), []);

  const controller = controllerRef.current;
  return {
    open,
    onMouseEnter: () => controller.enter(),
    onMouseLeave: () => controller.leave(),
  };
}
