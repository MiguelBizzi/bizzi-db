import { useEffect, useState } from 'react';
import { LATEST_RELEASE_API, VERSION } from './site';

export type LatestRelease = {
  version: string;
  publishedAt: string | null;
  /** True once GitHub has answered; false while showing the build-time fallback. */
  live: boolean;
};

const CACHE_KEY = 'bizzi-db:latest-release';
// GitHub allows 60 anonymous requests an hour per IP, so a reload should not spend one.
const CACHE_MS = 60 * 60 * 1000;

const FALLBACK: LatestRelease = {
  version: VERSION,
  publishedAt: null,
  live: false,
};

type Cached = { at: number; release: LatestRelease };

function readCache(): LatestRelease | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Cached;
    return Date.now() - cached.at < CACHE_MS ? cached.release : null;
  } catch {
    return null;
  }
}

function writeCache(release: LatestRelease) {
  try {
    const cached: Cached = { at: Date.now(), release };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Private mode or storage disabled: the next load simply asks again.
  }
}

export function parseRelease(body: unknown): LatestRelease | null {
  if (typeof body !== 'object' || body === null) return null;
  const { tag_name, published_at } = body as Record<string, unknown>;
  if (typeof tag_name !== 'string') return null;
  const version = tag_name.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+/.test(version)) return null;
  return {
    version,
    publishedAt: typeof published_at === 'string' ? published_at : null,
    live: true,
  };
}

let inflight: Promise<LatestRelease> | null = null;

function fetchLatest(): Promise<LatestRelease> {
  inflight ??= fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      const release = parseRelease(body) ?? FALLBACK;
      if (release.live) writeCache(release);
      return release;
    })
    .catch(() => FALLBACK);
  return inflight;
}

/** The newest published GitHub release, falling back to the version this site was built with. */
export function useLatestRelease(): LatestRelease {
  const [release, setRelease] = useState<LatestRelease>(
    () => readCache() ?? FALLBACK,
  );

  useEffect(() => {
    if (release.live) return;
    let cancelled = false;
    fetchLatest().then((next) => {
      if (!cancelled) setRelease(next);
    });
    return () => {
      cancelled = true;
    };
  }, [release.live]);

  return release;
}
