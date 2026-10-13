import type { ComponentProps } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { popIn, type PopOrigin } from '../../lib/motion';

type PopoverProps = Omit<
  ComponentProps<typeof motion.div>,
  'variants' | 'initial' | 'animate' | 'exit'
> & {
  /** Side of the popover that touches its trigger. */
  origin?: PopOrigin;
};

/**
 * Surface for menus and floating panels. Mount it conditionally inside
 * <AnimatePresence> so it can ease out as well as in.
 */
export function Popover({ origin = 'top', style, ...rest }: PopoverProps) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      {...rest}
      variants={popIn(origin)}
      initial="initial"
      animate="animate"
      exit="exit"
      // While easing out it must not take clicks: its handlers hold stale state.
      style={{
        transformOrigin: origin,
        ...style,
        ...(isPresent ? null : { pointerEvents: 'none' }),
      }}
    />
  );
}
