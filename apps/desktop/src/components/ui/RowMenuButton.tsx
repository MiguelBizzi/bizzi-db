import { EllipsisVertical } from 'lucide-react';

export function RowMenuButton({
  label,
  open,
  onOpen,
  onClose,
}: {
  label: string;
  open: boolean;
  onOpen: (x: number, y: number) => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      title="More actions"
      // The menu closes on any outside mousedown; keep this one from closing
      // it first so a second click toggles it shut instead of reopening it.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (open) {
          onClose();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
      className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-opacity ${
        open ? 'opacity-100 bg-accent text-foreground' : 'opacity-60 group-hover:opacity-100'
      }`}
    >
      <EllipsisVertical className="w-3.5 h-3.5" />
    </button>
  );
}
