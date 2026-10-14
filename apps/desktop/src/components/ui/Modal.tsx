import type { ComponentProps, MouseEvent } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { fade, scaleIn } from '../../lib/motion';

type ModalProps = Omit<ComponentProps<typeof motion.div>, 'variants' | 'initial' | 'animate' | 'exit'> & {
  align?: 'center' | 'top';
  onScrimClick?: () => void;
};

const ALIGN = {
  center: 'items-center',
  top: 'items-start pt-20',
};

/**
 * Scrim for a centered dialog. Render it as the root of a component mounted
 * inside <AnimatePresence> so it can fade out before unmounting.
 */
export function Modal({
  align = 'center',
  onScrimClick,
  className = '',
  style,
  children,
  ...rest
}: ModalProps) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      {...rest}
      variants={fade}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-center p-4 ${ALIGN[align]} ${className}`}
      // A fading scrim must not swallow clicks meant for the app behind it.
      style={{ ...style, pointerEvents: isPresent ? undefined : 'none' }}
      onClick={
        onScrimClick
          ? (event: MouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) onScrimClick();
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}

/** The dialog surface. Inherits enter/exit from the surrounding <Modal>. */
export function ModalPanel(props: ComponentProps<typeof motion.div>) {
  return <motion.div variants={scaleIn} {...props} />;
}
