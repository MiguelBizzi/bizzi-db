import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { fade, slideInRight } from '../../lib/motion';

interface DrawerProps {
  children: ReactNode;
  scrim?: boolean;
  onScrimClick?: () => void;
  /** Overrides for the scrim, e.g. a higher z-index for a drawer stacked over another. */
  scrimStyle?: CSSProperties;
}

/**
 * Root for a side drawer. Render it as the root of a component mounted inside
 * <AnimatePresence>; it has no box of its own and only drives its children's
 * enter and exit.
 */
export function Drawer({ children, scrim = true, onScrimClick, scrimStyle }: DrawerProps) {
  const isPresent = useIsPresent();

  return (
    <motion.div initial="initial" animate="animate" exit="exit" className="contents">
      {scrim && (
        <motion.div
          variants={fade}
          className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px]"
          // A fading scrim must not swallow clicks meant for the app behind it.
          style={{ ...scrimStyle, pointerEvents: isPresent ? undefined : 'none' }}
          onClick={onScrimClick}
        />
      )}
      {children}
    </motion.div>
  );
}

/** The drawer surface. Inherits enter/exit from the surrounding <Drawer>. */
export function DrawerPanel({ style, ...rest }: ComponentProps<typeof motion.aside>) {
  const isPresent = useIsPresent();

  return (
    <motion.aside
      variants={slideInRight}
      {...rest}
      // While sliding out it must not take clicks: its handlers hold stale state.
      style={{ ...style, ...(isPresent ? null : { pointerEvents: 'none' }) }}
    />
  );
}
