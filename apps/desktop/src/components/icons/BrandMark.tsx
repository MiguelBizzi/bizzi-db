// Bizzi DB "Cell B" mark. Source of truth: assets/brand/generate.mjs
const CELLS = {
  stemTop:
    'M44,0H136A14,14 0 0 1 150,14V255A14,14 0 0 1 136,269H14A14,14 0 0 1 0,255V44A44,44 0 0 1 44,0Z',
  stemBottom:
    'M14,291H136A14,14 0 0 1 150,305V546A14,14 0 0 1 136,560H44A44,44 0 0 1 0,516V305A14,14 0 0 1 14,291Z',
  bowlTop:
    'M186,0H227.5A134.5,134.5 0 0 1 362,134.5V134.5A134.5,134.5 0 0 1 227.5,269H186A14,14 0 0 1 172,255V14A14,14 0 0 1 186,0Z',
  bowlBottom:
    'M186,291H269.5A134.5,134.5 0 0 1 404,425.5V425.5A134.5,134.5 0 0 1 269.5,560H186A14,14 0 0 1 172,546V305A14,14 0 0 1 186,291Z',
};

const HEIGHT = { sm: 'h-5', md: 'h-7' } as const;

export function BrandMark({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof HEIGHT;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 404 560"
      role="img"
      aria-label="Bizzi DB"
      className={`${HEIGHT[size]} w-auto shrink-0 ${className}`}
    >
      <path d={CELLS.stemTop} className="fill-foreground" />
      <path d={CELLS.stemBottom} className="fill-foreground" />
      <path d={CELLS.bowlTop} className="fill-foreground" />
      <path d={CELLS.bowlBottom} className="fill-primary" />
    </svg>
  );
}
