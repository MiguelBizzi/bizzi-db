export const REQUIRED_PLATFORMS = ['darwin-aarch64', 'darwin-x86_64'] as const;

type Platform = { signature?: unknown; url?: unknown };

/**
 * Checks the `latest.json` that tauri-action publishes. Returns one message
 * per problem; an empty list means installed apps will be able to update.
 */
export function validateUpdaterManifest(
  manifest: unknown,
  tag: string,
): string[] {
  if (!manifest || typeof manifest !== 'object') {
    return ['latest.json is missing or is not a JSON object'];
  }
  const { version, platforms } = manifest as {
    version?: unknown;
    platforms?: Record<string, Platform>;
  };
  const problems: string[] = [];

  const expected = tag.replace(/^v/, '');
  if (version !== expected) {
    problems.push(`version is ${String(version)} but the tag is ${expected}`);
  }

  for (const name of REQUIRED_PLATFORMS) {
    const entry = platforms?.[name];
    if (!entry) {
      problems.push(`platform ${name} is missing`);
      continue;
    }
    if (typeof entry.signature !== 'string' || !entry.signature.trim()) {
      problems.push(`platform ${name} has an empty signature`);
    }
    if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) {
      problems.push(`platform ${name} needs an https url`);
    }
  }
  return problems;
}
