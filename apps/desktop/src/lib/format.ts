export function formatSizeMb(sizeMb: number): string {
  const value = Number.isFinite(sizeMb) ? sizeMb : 0;
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MB`;
}

export function knownRowCount(rowCount: number): number | null {
  if (!Number.isFinite(rowCount) || rowCount < 0) return null;
  return rowCount;
}

export function knownSizeMb(sizeMb: number, isView = false): number | null {
  if (!Number.isFinite(sizeMb) || sizeMb < 0) return null;
  if (isView && sizeMb === 0) return null;
  return sizeMb;
}

export function tableStatParts(table: {
  rowCount: number;
  sizeMb: number;
  isView?: boolean;
}): string[] {
  const parts: string[] = [];
  const rows = knownRowCount(table.rowCount);
  if (rows !== null) {
    parts.push(`${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}`);
  }
  const size = knownSizeMb(table.sizeMb, Boolean(table.isView));
  if (size !== null) parts.push(formatSizeMb(size));
  return parts;
}
