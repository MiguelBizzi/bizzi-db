import { useEffect } from 'react';
import { registerScope } from './commandBus';

/**
 * While `open`, the menu bar treats the app as showing a modal, so its
 * commands don't act on the view behind a component's own drawer or dialog.
 */
export function useMenuModalGate(owner: string, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const scope = registerScope(`modal:${owner}`, {});
    scope.setContext({ modalOpen: true });
    return () => scope.dispose();
  }, [owner, open]);
}
