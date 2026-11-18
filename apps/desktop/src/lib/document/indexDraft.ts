import type { IndexDraft } from '@db/shared';
import type { DocumentCapabilities } from '@db/database';

/** User-facing sentences; the server still has the last word. */
export function validateIndexDraft(draft: IndexDraft, caps: DocumentCapabilities): string[] {
  if (draft.keys.length === 0) return ['Add at least one key.'];
  const errors: string[] = [];
  const fields = draft.keys.map(([field]) => field.trim());
  const kinds = draft.keys.map(([, kind]) => kind);

  if (fields.some((field) => field === '')) errors.push('Every key needs a field name.');

  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const field of fields) {
    if (field === '') continue;
    if (seen.has(field)) repeated.add(field);
    seen.add(field);
  }
  for (const field of repeated) errors.push(`The field "${field}" is used in more than one key.`);

  if (kinds.includes('hashed')) {
    if (draft.keys.length > 1) errors.push('A hashed index can have only one key.');
    if (draft.unique) errors.push('A hashed index cannot be unique.');
  }

  if (draft.ttlSeconds != null) {
    if (draft.keys.length !== 1) errors.push('A TTL index needs exactly one key.');
    if (!Number.isInteger(draft.ttlSeconds) || draft.ttlSeconds < 0) {
      errors.push('TTL seconds must be a whole number of 0 or more.');
    }
  }

  if (!caps.textIndexes && kinds.includes('text')) errors.push('Text indexes are not supported.');
  if (!caps.geoIndexes && kinds.includes('2dsphere')) errors.push('Geospatial indexes are not supported.');
  if (!caps.hashedIndexes && kinds.includes('hashed')) errors.push('Hashed indexes are not supported.');
  if (!caps.ttlIndexes && draft.ttlSeconds != null) errors.push('TTL indexes are not supported.');
  if (!caps.hiddenIndexes && draft.hidden) errors.push('Hidden indexes are not supported.');
  if (!caps.partialIndexes && draft.partialFilter.trim() !== '') {
    errors.push('Partial indexes are not supported.');
  }
  return errors;
}

export function indexKeysLabel(keys: [string, string][]): string {
  const parts = keys.map(([field, kind]) => `${field}: ${/^-?\d+$/.test(kind) ? kind : JSON.stringify(kind)}`);
  return `{ ${parts.join(', ')} }`;
}

export function indexDraftSummary(draft: IndexDraft): string {
  const flags: string[] = [];
  if (draft.unique) flags.push('unique');
  if (draft.sparse) flags.push('sparse');
  if (draft.hidden) flags.push('hidden');
  if (draft.ttlSeconds != null) flags.push(`ttl ${draft.ttlSeconds}s`);
  if (draft.partialFilter.trim() !== '') flags.push('partial');
  const keys = indexKeysLabel(draft.keys);
  return flags.length > 0 ? `${keys} ${flags.join(', ')}` : keys;
}
