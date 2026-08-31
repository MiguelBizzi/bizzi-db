interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
}

export function Switch({ checked, onCheckedChange, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? 'bg-primary shadow-[0_0_0_3px] shadow-primary/20' : 'bg-muted border border-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/80'
        }`}
      />
    </button>
  );
}
