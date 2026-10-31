import type { IndexDefinition, TableSchema } from '../types';

export interface IndexInsight {
  kind: 'invalid' | 'unused' | 'redundant';
  /** Short badge text. */
  label: string;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export { formatBytes as formatIndexSize };

function keySignature(index: IndexDefinition): string[] {
  if (index.keys?.length) {
    return index.keys.map(
      (key) =>
        `${key.isExpression ? 'expr' : 'col'}:${key.expression}:${key.descending}:${key.nullsFirst ?? ''}:${key.opclass ?? ''}:${key.collation ?? ''}`
    );
  }
  return index.columns.map((column) => `col:${column}:false:::`);
}

function enforces(index: IndexDefinition): boolean {
  return index.isUnique || Boolean(index.isPrimary) || Boolean(index.constraint);
}

/**
 * Another index whose leading keys are this one's keys, with the same method
 * and predicate, can serve every lookup this one can.
 */
function coveringIndex(index: IndexDefinition, others: IndexDefinition[]): IndexDefinition | undefined {
  if (enforces(index) || index.isValid === false) return undefined;
  const keys = keySignature(index);
  if (keys.length === 0) return undefined;
  return others.find((other) => {
    if (other.name === index.name || other.isValid === false) return false;
    if (other.type !== index.type || (other.predicate ?? '') !== (index.predicate ?? '')) return false;
    const otherKeys = keySignature(other);
    if (otherKeys.length < keys.length) return false;
    // Two identical non-enforcing indexes: flag only the later one.
    if (otherKeys.length === keys.length && !enforces(other) && other.name > index.name) return false;
    return keys.every((key, i) => key === otherKeys[i]);
  });
}

export function indexInsights(
  table: TableSchema,
  options?: { invalidIndexes?: boolean },
): Map<string, IndexInsight[]> {
  const invalidIndexes = options?.invalidIndexes !== false;
  const result = new Map<string, IndexInsight[]>();
  for (const index of table.indexes) {
    const insights: IndexInsight[] = [];
    if (invalidIndexes && index.isValid === false) {
      insights.push({
        kind: 'invalid',
        label: 'Invalid',
        message:
          'This index is INVALID, usually from a failed concurrent build. It slows down writes but is never used by queries. Drop it and build it again.',
      });
    }
    const covering = coveringIndex(index, table.indexes);
    if (covering) {
      insights.push({
        kind: 'redundant',
        label: 'Redundant',
        message: `"${covering.name}" starts with the same keys, so queries can use it instead. Dropping this one saves space and speeds up writes.`,
      });
    }
    if (index.scans === 0 && !enforces(index) && index.isValid !== false) {
      const size = index.sizeBytes ? ` and takes ${formatBytes(index.sizeBytes)}` : '';
      insights.push({
        kind: 'unused',
        label: 'Unused',
        message: `No index scans since statistics were last reset. It still costs time on every write${size}. Check replicas and rare jobs before dropping it.`,
      });
    }
    if (insights.length > 0) result.set(index.name, insights);
  }
  return result;
}

export function describeIndex(index: IndexDefinition): string {
  const keys = index.keys?.length
    ? index.keys.map((key) => (key.isExpression ? `(${key.expression})` : key.expression))
    : index.columns;
  const parts: string[] = [];
  if (index.constraint?.kind === 'primary' || index.isPrimary) parts.push('Enforces the primary key');
  else if (index.constraint?.kind === 'exclusion') parts.push('Enforces an exclusion constraint');
  else if (index.isUnique) parts.push('Enforces uniqueness');
  else parts.push('Speeds up lookups');
  parts.push(`on ${keys.join(', ')}`);
  if (index.predicate) parts.push(`for rows where ${index.predicate}`);
  let text = parts.join(' ');
  if (index.includeColumns?.length) {
    text += `; also stores ${index.includeColumns.join(', ')} so queries can skip the table`;
  }
  return `${text}.`;
}
