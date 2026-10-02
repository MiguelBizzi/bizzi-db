import { Database } from 'lucide-react';

export function BrandMark({
  size = 'md',
}: {
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'p-1' : 'p-1.5';
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div
      className={`${box} rounded-lg bg-primary/15 text-primary border border-primary/30`}
    >
      <Database className={icon} />
    </div>
  );
}
