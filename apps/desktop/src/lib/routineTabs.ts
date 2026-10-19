import type { RoutineDefinition } from '../types';

export function routineTabTitle(routine: Pick<RoutineDefinition, 'name' | 'kind'>): string {
  return `${routine.name} (${routine.kind === 'procedure' ? 'Procedure' : 'Function'})`;
}

export interface RoutineTarget {
  schema: string;
  name: string;
  /** The id the routine should have, when known (e.g. unchanged arguments). */
  preferredId?: string;
}

/**
 * The routine a tab should show after DDL renamed, moved or recreated it.
 * Overloads share a name, so an exact id wins; otherwise the only (or first)
 * routine with that schema and name.
 */
export function resolveRoutine(
  routines: RoutineDefinition[],
  target: RoutineTarget
): RoutineDefinition | undefined {
  if (target.preferredId) {
    const exact = routines.find((routine) => routine.id === target.preferredId);
    if (exact) return exact;
  }
  return routines.find((routine) => routine.schema === target.schema && routine.name === target.name);
}

export function filterRoutines(
  routines: RoutineDefinition[],
  opts: { search: string; schema: string }
): RoutineDefinition[] {
  const term = opts.search.trim().toLowerCase();
  return routines.filter(
    (routine) =>
      (opts.schema === 'ALL' || routine.schema === opts.schema) &&
      (!term || routine.name.toLowerCase().includes(term))
  );
}
