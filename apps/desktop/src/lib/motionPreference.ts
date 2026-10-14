import { useSyncExternalStore } from 'react';

export type MotionPreference = 'on' | 'system' | 'reduced';

export const MOTION_PREFERENCE_KEY = 'bizzi.motion';
export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'on';

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function parseMotionPreference(raw: unknown): MotionPreference {
  return raw === 'on' || raw === 'system' || raw === 'reduced'
    ? raw
    : DEFAULT_MOTION_PREFERENCE;
}

export function resolveReducedMotion(
  pref: MotionPreference,
  systemPrefersReduced: boolean
): boolean {
  if (pref === 'reduced') return true;
  if (pref === 'system') return systemPrefersReduced;
  return false;
}

function defaultStorage(): PrefStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadMotionPreference(
  storage: PrefStorage | undefined = defaultStorage()
): MotionPreference {
  try {
    return parseMotionPreference(storage?.getItem(MOTION_PREFERENCE_KEY));
  } catch {
    return DEFAULT_MOTION_PREFERENCE;
  }
}

export function saveMotionPreference(
  pref: MotionPreference,
  storage: PrefStorage | undefined = defaultStorage()
): void {
  try {
    storage?.setItem(MOTION_PREFERENCE_KEY, pref);
  } catch {
    // Storage can be unavailable; the preference still applies for this session.
  }
}

let current = loadMotionPreference();
const listeners = new Set<() => void>();

export function getMotionPreference(): MotionPreference {
  return current;
}

export function setMotionPreference(pref: MotionPreference): void {
  current = pref;
  saveMotionPreference(pref);
  listeners.forEach((listener) => listener());
}

export function subscribeMotionPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeSystem(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function systemPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

export function useMotionPreference(): {
  preference: MotionPreference;
  reduced: boolean;
  setPreference: (pref: MotionPreference) => void;
} {
  const preference = useSyncExternalStore(subscribeMotionPreference, getMotionPreference);
  const system = useSyncExternalStore(subscribeSystem, systemPrefersReduced);
  return {
    preference,
    reduced: resolveReducedMotion(preference, system),
    setPreference: setMotionPreference,
  };
}
