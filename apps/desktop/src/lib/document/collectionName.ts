const FORBIDDEN_DATABASE_CHARS = /[/\\. "$*<>:|?\0]/;
const MAX_DATABASE_BYTES = 64;

/** Client-side mirror of MongoDB's naming rules; the server still validates. */
export function validateCollectionName(name: string): string | null {
  if (name === '') return 'Enter a collection name.';
  if (name.includes('$')) return 'A collection name cannot contain "$".';
  if (name.includes('\0')) return 'A collection name cannot contain a null character.';
  if (name.startsWith('system.')) return 'A collection name cannot start with "system.".';
  return null;
}

export function validateDatabaseName(name: string): string | null {
  if (name === '') return 'Enter a database name.';
  if (FORBIDDEN_DATABASE_CHARS.test(name)) {
    return 'A database name cannot contain / \\ . " $ * < > : | ? a space or a null character.';
  }
  if (new TextEncoder().encode(name).length > MAX_DATABASE_BYTES) {
    return 'A database name is at most 64 bytes.';
  }
  return null;
}
