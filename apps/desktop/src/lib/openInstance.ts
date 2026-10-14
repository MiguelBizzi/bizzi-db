export interface OpenInstance {
  open: boolean;
  id: number;
}

export const INITIAL_OPEN_INSTANCE: OpenInstance = { open: false, id: 0 };

/** Bumps `id` on every closed → open transition, so each opening can be keyed. */
export function nextOpenInstance(state: OpenInstance, open: boolean): OpenInstance {
  if (state.open === open) return state;
  return { open, id: open ? state.id + 1 : state.id };
}
