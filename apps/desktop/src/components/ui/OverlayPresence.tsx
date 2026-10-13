import { Fragment, useRef, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { INITIAL_OPEN_INSTANCE, nextOpenInstance } from '../../lib/openInstance';

interface OverlayPresenceProps {
  isOpen: boolean;
  children: ReactNode;
}

/**
 * Mounts an overlay while open and lets it animate out on close. Every opening
 * gets a fresh instance, so reopening during the exit never revives stale state.
 */
export function OverlayPresence({ isOpen, children }: OverlayPresenceProps) {
  const instance = useRef(INITIAL_OPEN_INSTANCE);
  instance.current = nextOpenInstance(instance.current, isOpen);

  return (
    <AnimatePresence>
      {isOpen && <Fragment key={instance.current.id}>{children}</Fragment>}
    </AnimatePresence>
  );
}
