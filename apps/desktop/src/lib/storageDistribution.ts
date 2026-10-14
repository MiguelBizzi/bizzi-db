import { knownSizeMb } from './format';

export const TOP_COUNT = 8;
export const OTHER_THRESHOLD_PCT = 0.5;

export interface StorageRow {
  name: string;
  sizeMb: number;
  pct: number;
}

export interface StorageDistribution {
  top: StorageRow[];
  other: StorageRow[];
  otherMb: number;
  otherPct: number;
  unknown: { name: string }[];
  totalMb: number;
}

interface SizedTable {
  name: string;
  sizeMb: number;
  isView?: boolean;
}

export function buildStorageDistribution(tables: SizedTable[]): StorageDistribution {
  const known: { name: string; sizeMb: number }[] = [];
  const unknown: { name: string }[] = [];

  for (const table of tables) {
    const size = knownSizeMb(table.sizeMb, Boolean(table.isView));
    if (size === null) unknown.push({ name: table.name });
    else known.push({ name: table.name, sizeMb: size });
  }

  const totalMb = known.reduce((sum, row) => sum + row.sizeMb, 0);
  const rows: StorageRow[] = known
    .map((row) => ({
      ...row,
      pct: totalMb > 0 ? (row.sizeMb / totalMb) * 100 : 0,
    }))
    .sort((a, b) => b.sizeMb - a.sizeMb || a.name.localeCompare(b.name));

  const top: StorageRow[] = [];
  const other: StorageRow[] = [];
  for (const row of rows) {
    if (top.length < TOP_COUNT && row.pct >= OTHER_THRESHOLD_PCT) top.push(row);
    else other.push(row);
  }

  const otherMb = other.reduce((sum, row) => sum + row.sizeMb, 0);
  const otherPct = totalMb > 0 ? (otherMb / totalMb) * 100 : 0;

  return { top, other, otherMb, otherPct, unknown, totalMb };
}
