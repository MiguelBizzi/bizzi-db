interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, id, disabled }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
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
