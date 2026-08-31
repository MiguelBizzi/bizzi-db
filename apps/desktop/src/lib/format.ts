export function formatSizeMb(sizeMb: number): string {
  const value = Number.isFinite(sizeMb) ? sizeMb : 0;
    return `${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} MB`;
}
