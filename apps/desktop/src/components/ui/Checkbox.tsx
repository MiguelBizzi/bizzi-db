import { Check } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  'aria-label'?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-border bg-background transition-colors checked:border-primary checked:bg-primary hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
      <Check
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
        strokeWidth={3}
      />
    </span>
  );
}
