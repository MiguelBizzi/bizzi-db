import React, { useState } from 'react';
import { motion } from 'motion/react';
import { slideUp } from '../lib/motion';
import { CircleAlert, Download } from 'lucide-react';
import type { AppUpdateStatus } from '../lib/appUpdate';

interface UpdateBannerProps {
  status: AppUpdateStatus;
  hasUnsavedChanges: boolean;
  onRestart: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onLater: () => void;
}

const BUTTON =
  'h-7 px-2.5 rounded-lg border border-border font-bold uppercase text-[10px] hover:bg-accent';

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  status,
  hasUnsavedChanges,
  onRestart,
  onRetry,
  onLater,
}) => {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (status.phase === 'error') {
    return (
      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        exit="exit"
        role="alert"
        className="fixed bottom-4 left-4 z-[250] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl"
      >
        <div className="flex items-start gap-2">
          <CircleAlert className="w-3.5 h-3.5 mt-0.5 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">
              {status.stage === 'install'
                ? 'Update could not be installed'
                : 'Update could not be downloaded'}
            </p>
            <p className="mt-0.5 text-muted-foreground break-words">
              {status.message} Your current version keeps working.
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex justify-end gap-2">
          <button type="button" className={BUTTON} onClick={onLater}>
            Dismiss
          </button>
          <button
            type="button"
            className={`${BUTTON} bg-primary text-primary-foreground`}
            onClick={() => {
              void onRetry();
            }}
          >
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  if (status.phase !== 'ready') return null;

  const restartLabel = confirmingDiscard ? 'Restart anyway' : 'Restart now';

  return (
    <motion.div
      variants={slideUp}
      initial="initial"
      animate="animate"
      exit="exit"
      role="status"
      className="fixed bottom-4 left-4 z-[250] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl"
    >
      <div className="flex items-start gap-2">
        <Download className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold">Update {status.version} is ready to install</p>
          <p className="mt-0.5 text-muted-foreground">
            {confirmingDiscard
              ? 'You have unapplied table changes. Restarting will discard them.'
              : 'Restart Bizzi DB to finish updating.'}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setConfirmingDiscard(false);
            onLater();
          }}
        >
          Later
        </button>
        <button
          type="button"
          className={`${BUTTON} bg-primary text-primary-foreground`}
          onClick={() => {
            if (hasUnsavedChanges && !confirmingDiscard) {
              setConfirmingDiscard(true);
              return;
            }
            void onRestart();
          }}
        >
          {restartLabel}
        </button>
      </div>
    </motion.div>
  );
};
