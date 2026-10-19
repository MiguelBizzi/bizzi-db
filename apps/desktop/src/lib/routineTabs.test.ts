import { describe, expect, test } from 'bun:test';
import type { RoutineDefinition } from '../types';
import { filterRoutines, resolveRoutine, routineTabTitle } from './routineTabs';

function routine(schema: string, name: string, args = ''): RoutineDefinition {
  return {
    id: `${schema}.${name}(${args})`,
    oid: '1',
    schema,
    name,
    kind: 'function',
    identityArguments: args,
    parameters: [],
    returnsSet: false,
    language: 'sql',
    volatility: 'volatile',
    isStrict: false,
    securityDefiner: false,
    hasSqlBody: false,
  };
}

const routines = [routine('shop', 'total', 'a integer'), routine('shop', 'total', 'a text'), routine('ops', 'purge')];

describe('resolveRoutine', () => {
  test('prefers the exact id, then schema and name', () => {
    expect(resolveRoutine(routines, { schema: 'shop', name: 'total', preferredId: 'shop.total(a text)' })?.identityArguments).toBe('a text');
    expect(resolveRoutine(routines, { schema: 'shop', name: 'total', preferredId: 'gone' })?.identityArguments).toBe('a integer');
    expect(resolveRoutine(routines, { schema: 'ops', name: 'nope' })).toBeUndefined();
  });
});

describe('filterRoutines', () => {
  test('filters by schema and a case-insensitive name search', () => {
    expect(filterRoutines(routines, { search: 'TOT', schema: 'ALL' })).toHaveLength(2);
    expect(filterRoutines(routines, { search: '', schema: 'ops' }).map((r) => r.name)).toEqual(['purge']);
  });
});

describe('routineTabTitle', () => {
  test('names the kind', () => {
    expect(routineTabTitle({ name: 'purge', kind: 'procedure' })).toBe('purge (Procedure)');
    expect(routineTabTitle({ name: 'total', kind: 'function' })).toBe('total (Function)');
  });
});
