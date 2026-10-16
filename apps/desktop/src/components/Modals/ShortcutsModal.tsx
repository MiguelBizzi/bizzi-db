import React, { useEffect, useId } from "react";
import { Keyboard, X } from "lucide-react";
import { OverlayPresence } from "../ui/OverlayPresence";
import { Modal, ModalPanel } from "../ui/Modal";
import type { CheatSheetGroup } from "../../lib/commands/shortcutsCheatSheet";

interface ShortcutsModalProps {
  isOpen: boolean;
  groups: CheatSheetGroup[];
  onClose: () => void;
}

const ShortcutsModalBody: React.FC<ShortcutsModalProps> = ({ isOpen, groups, onClose }) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Modal className="font-sans select-none text-foreground" onScrimClick={onClose}>
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg max-h-[80vh] bg-popover border border-border rounded-2xl shadow-2xl flex flex-col text-popover-foreground"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60 rounded-t-2xl">
          <div className="flex items-center gap-2.5 font-mono">
            <Keyboard className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            <span id={titleId} className="text-sm font-bold text-foreground">
              Keyboard Shortcuts
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close keyboard shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 font-mono text-xs overflow-y-auto">
          {groups.map(({ group, rows }) => (
            <section key={group} className="space-y-1.5">
              <h3 className="text-[10px] font-bold uppercase text-muted-foreground">{group}</h3>
              <dl className="bg-background border border-border rounded-xl divide-y divide-border">
                {rows.map((row) => (
                  <div key={row.label} className="h-8 px-3 flex items-center justify-between gap-3">
                    <dt className="text-foreground truncate">{row.label}</dt>
                    <dd>
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded text-muted-foreground">
                        {row.shortcut}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </ModalPanel>
    </Modal>
  );
};

export const ShortcutsModal: React.FC<ShortcutsModalProps> = (props) => (
  <OverlayPresence isOpen={props.isOpen}>
    <ShortcutsModalBody {...props} />
  </OverlayPresence>
);
