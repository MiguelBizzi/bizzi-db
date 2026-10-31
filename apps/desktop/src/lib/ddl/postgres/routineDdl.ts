import { DIALECTS } from '@db/database';
import type { RoutineDefinition, RoutineKind } from '../../../types';
import { parseTypeSql, qualifyTable as qualifyQuoted } from '../../schemaChange';
import type { DdlResult, ReturnDraft, RoutineDraft, RoutineParameterDraft } from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.PostgreSQL;
const qualifyTable = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);
const caps = DIALECTS.PostgreSQL.objects.routines;

const DEFAULT_COST = 100;
const DEFAULT_ROWS = 1000;
const MAX_NAME_BYTES = 63;

const PLPGSQL_FUNCTION_BODY = '\nBEGIN\n  \nEND;\n';

export function emptyRoutineDraft(schema: string, kind: RoutineKind): RoutineDraft {
  return {
    schema,
    name: '',
    kind,
    parameters: [],
    returns: { kind: 'type', type: 'void', setOf: false },
    language: caps.defaultLanguage,
    body: PLPGSQL_FUNCTION_BODY,
    volatility: caps.defaultVolatility,
    strict: false,
    securityDefiner: false,
    parallel: caps.parallelModes.length > 0 ? 'unsafe' : '',
    leakproof: false,
    cost: '',
    rows: '',
    comment: '',
  };
}

function returnsFrom(routine: RoutineDefinition): ReturnDraft {
  const tableColumns = routine.parameters.filter((param) => param.mode === 'table');
  if (tableColumns.length > 0) {
    return {
      kind: 'table',
      columns: tableColumns.map((param) => ({ name: param.name, dataType: param.dataType })),
    };
  }
  const result = (routine.returnType ?? '').trim();
  const setOf = /^setof\s+/i.test(result);
  return { kind: 'type', type: setOf ? result.replace(/^setof\s+/i, '') : result, setOf };
}

export function routineDraftFrom(routine: RoutineDefinition, body: string): RoutineDraft {
  return {
    schema: routine.schema,
    name: routine.name,
    kind: routine.kind,
    parameters: routine.parameters
      .filter((param) => param.mode !== 'table')
      .map((param) => ({
        mode: param.mode as RoutineParameterDraft['mode'],
        name: param.name,
        dataType: param.dataType,
        default: param.default ?? '',
      })),
    returns: returnsFrom(routine),
    language: routine.language,
    body,
    volatility: routine.volatility,
    strict: routine.isStrict,
    securityDefiner: routine.securityDefiner,
    parallel: routine.parallel ?? '',
    leakproof: Boolean(routine.leakproof),
    cost: routine.cost === undefined || routine.cost === DEFAULT_COST ? '' : String(routine.cost),
    rows:
      !routine.returnsSet || routine.rows === undefined || routine.rows === DEFAULT_ROWS
        ? ''
        : String(routine.rows),
    comment: routine.comment ?? '',
  };
}

/** Dollar-quotes `body` with a tag that does not occur in it. */
export function dollarQuote(body: string, preferred: string): string {
  let tag = `$${preferred}$`;
  for (let n = 1; body.includes(tag); n += 1) tag = `$fn_${n}$`;
  return `${tag}${body}${tag}`;
}

const isInput = (param: RoutineParameterDraft) => param.mode !== 'out';

export function validateRoutine(draft: RoutineDraft): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Name is required.');
  else if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) {
    errors.push(`Name is longer than ${MAX_NAME_BYTES} bytes.`);
  }
  if (!draft.schema.trim()) errors.push('Schema is required.');

  const params = draft.parameters;
  if (params.some((param) => !param.dataType.trim())) errors.push('Every parameter needs a type.');
  const seen = new Set<string>();
  const names = [
    ...params.map((param) => param.name.trim()),
    ...(draft.kind === 'function' && draft.returns.kind === 'table'
      ? draft.returns.columns.map((column) => column.name.trim())
      : []),
  ];
  for (const paramName of names) {
    if (!paramName) continue;
    if (seen.has(paramName)) errors.push(`Parameter "${paramName}" is declared twice.`);
    seen.add(paramName);
  }
  const inputs = params.filter(isInput);
  const firstDefault = inputs.findIndex((param) => param.default.trim());
  if (firstDefault >= 0 && inputs.slice(firstDefault).some((param) => !param.default.trim())) {
    errors.push('Parameters after one with a default must also have defaults.');
  }
  const variadic = inputs.findIndex((param) => param.mode === 'variadic');
  if (variadic >= 0 && variadic !== inputs.length - 1) {
    errors.push('A VARIADIC parameter must be the last input parameter.');
  }
  if (params.some((param) => param.mode === 'out' && param.default.trim())) {
    errors.push('OUT parameters cannot have defaults.');
  }

  if (draft.kind === 'function') {
    if (draft.returns.kind === 'type' && !draft.returns.type.trim()) {
      errors.push('Return type is required.');
    }
    if (draft.returns.kind === 'table') {
      if (draft.returns.columns.length === 0) errors.push('RETURNS TABLE needs at least one column.');
      if (draft.returns.columns.some((column) => !column.name.trim() || !column.dataType.trim())) {
        errors.push('Every RETURNS TABLE column needs a name and a type.');
      }
      if (params.some((param) => param.mode === 'out' || param.mode === 'inout')) {
        errors.push('Use either OUT parameters or RETURNS TABLE, not both.');
      }
    }
    for (const [label, value] of [
      ['Cost', draft.cost],
      ['Rows', draft.rows],
    ] as const) {
      if (value.trim() && !(Number(value) > 0)) errors.push(`${label} must be a positive number.`);
    }
  }
  if (!draft.body.trim()) errors.push('Body is required.');
  return errors;
}

function keyword(kind: RoutineKind): 'FUNCTION' | 'PROCEDURE' {
  return kind === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
}

function parameterSql(param: RoutineParameterDraft): string {
  const mode = param.mode === 'in' ? '' : `${param.mode === 'inout' ? 'INOUT' : param.mode.toUpperCase()} `;
  const name = param.name.trim() ? `${quoteIdent(param.name.trim())} ` : '';
  const fallback = param.default.trim() ? ` DEFAULT ${param.default.trim()}` : '';
  return `${mode}${name}${param.dataType.trim()}${fallback}`;
}

/** Argument types alone, as COMMENT ON identifies the routine. */
function signatureTypes(draft: RoutineDraft): string {
  return draft.parameters
    .filter((param) => draft.kind === 'procedure' || param.mode !== 'out')
    .map((param) => {
      const mode =
        param.mode === 'variadic'
          ? 'VARIADIC '
          : draft.kind === 'procedure' && param.mode !== 'in'
            ? `${param.mode.toUpperCase()} `
            : '';
      return `${mode}${param.dataType.trim()}`;
    })
    .join(', ');
}

function returnsSql(returns: ReturnDraft): string {
  if (returns.kind === 'table') {
    const columns = returns.columns
      .map((column) => `${quoteIdent(column.name.trim())} ${column.dataType.trim()}`)
      .join(', ');
    return `RETURNS TABLE (${columns})`;
  }
  return `RETURNS ${returns.setOf ? 'SETOF ' : ''}${returns.type.trim()}`;
}

function returnsSet(returns: ReturnDraft): boolean {
  return returns.kind === 'table' || returns.setOf;
}

function createStatement(draft: RoutineDraft, orReplace: boolean, schema = draft.schema, name = draft.name): string {
  const isFunction = draft.kind === 'function';
  const lines = [
    `CREATE ${orReplace ? 'OR REPLACE ' : ''}${keyword(draft.kind)} ${qualifyTable(schema.trim(), name.trim())}(${draft.parameters.map(parameterSql).join(', ')})`,
  ];
  if (isFunction) lines.push(returnsSql(draft.returns));
  lines.push(`LANGUAGE ${draft.language.trim()}`);
  if (isFunction) {
    if (draft.volatility !== 'volatile') lines.push(draft.volatility.toUpperCase());
    if (draft.strict) lines.push('STRICT');
  }
  if (draft.securityDefiner) lines.push('SECURITY DEFINER');
  if (isFunction) {
    if (draft.leakproof) lines.push('LEAKPROOF');
    if (draft.parallel && draft.parallel !== 'unsafe') lines.push(`PARALLEL ${draft.parallel.toUpperCase()}`);
    if (draft.cost.trim()) lines.push(`COST ${draft.cost.trim()}`);
    if (draft.rows.trim() && returnsSet(draft.returns)) lines.push(`ROWS ${draft.rows.trim()}`);
  }
  lines.push(`AS ${dollarQuote(draft.body, draft.kind)};`);
  return lines.join('\n');
}

function commentStatement(draft: RoutineDraft, comment: string): string {
  const target = `${qualifyTable(draft.schema.trim(), draft.name.trim())}(${signatureTypes(draft)})`;
  const value = comment.trim() ? quoteLiteral(comment.trim()) : 'NULL';
  return `COMMENT ON ${keyword(draft.kind)} ${target} IS ${value};`;
}

function refuse(reason: string): DdlResult {
  return { ok: false, reason };
}

export function createRoutine(draft: RoutineDraft): DdlResult {
  const errors = validateRoutine(draft);
  if (errors.length > 0) return refuse(errors[0]);
  const statements = [createStatement(draft, false)];
  if (draft.comment.trim()) statements.push(commentStatement(draft, draft.comment));
  return { ok: true, mode: 'create', statements, transactional: true, warnings: [] };
}

function normType(type: string): string {
  const parsed = parseTypeSql(type);
  return [parsed.base, parsed.length, parsed.precision, parsed.scale].join(':');
}

function normReturns(draft: RoutineDraft): string {
  if (draft.kind === 'procedure') return '';
  const returns = draft.returns;
  if (returns.kind === 'table') {
    return `table:${returns.columns.map((c) => `${c.name.trim()} ${normType(c.dataType)}`).join(',')}`;
  }
  return `${returns.setOf ? 'setof ' : ''}${normType(returns.type)}`;
}

/**
 * What PostgreSQL won't change with CREATE OR REPLACE: argument types and
 * modes, input parameter names, OUT parameters, the result type, kind, and
 * removing a default.
 */
function signatureChanged(before: RoutineDraft, after: RoutineDraft): boolean {
  if (before.kind !== after.kind) return true;
  if (normReturns(before) !== normReturns(after)) return true;
  if (before.parameters.length !== after.parameters.length) return true;
  return before.parameters.some((param, i) => {
    const next = after.parameters[i];
    return (
      param.mode !== next.mode ||
      normType(param.dataType) !== normType(next.dataType) ||
      param.name.trim() !== next.name.trim() ||
      (param.default.trim() !== '' && next.default.trim() === '')
    );
  });
}

function definitionChanged(before: RoutineDraft, after: RoutineDraft): boolean {
  return (
    before.language.trim() !== after.language.trim() ||
    before.body !== after.body ||
    before.volatility !== after.volatility ||
    before.strict !== after.strict ||
    before.securityDefiner !== after.securityDefiner ||
    before.parallel !== after.parallel ||
    before.leakproof !== after.leakproof ||
    before.cost.trim() !== after.cost.trim() ||
    before.rows.trim() !== after.rows.trim() ||
    before.parameters.some((param, i) => param.default.trim() !== after.parameters[i]?.default.trim())
  );
}

function identity(routine: RoutineDefinition, schema = routine.schema, name = routine.name): string {
  return `${qualifyTable(schema, name)}(${routine.identityArguments})`;
}

export function planRoutineChange(
  original: RoutineDefinition,
  body: string,
  draft: RoutineDraft
): DdlResult {
  if (original.hasSqlBody) {
    return refuse(
      'This routine has a SQL-standard body (BEGIN ATOMIC), which the form cannot edit. ' +
        'Open its definition in the SQL editor to change it.'
    );
  }
  const errors = validateRoutine(draft);
  if (errors.length > 0) return refuse(errors[0]);
  const before = routineDraftFrom(original, body);
  const word = keyword(original.kind);

  if (signatureChanged(before, draft)) {
    const statements = [`DROP ${word} ${identity(original)};`, createStatement(draft, false)];
    if (draft.comment.trim()) statements.push(commentStatement(draft, draft.comment));
    return {
      ok: true,
      mode: 'recreate',
      statements,
      transactional: true,
      warnings: [
        "PostgreSQL can't change a routine's arguments, result type or kind in place, so it is dropped " +
          'and recreated in one transaction. The drop fails if views, triggers or other objects depend ' +
          'on it, and privileges granted on it are lost.',
      ],
    };
  }

  const statements: string[] = [];
  const replaced = definitionChanged(before, draft);
  if (replaced) statements.push(createStatement(draft, true, original.schema, original.name));
  const newName = draft.name.trim();
  const newSchema = draft.schema.trim();
  if (newName !== original.name) {
    statements.push(`ALTER ${word} ${identity(original)} RENAME TO ${quoteIdent(newName)};`);
  }
  if (newSchema !== original.schema) {
    statements.push(
      `ALTER ${word} ${identity(original, original.schema, newName)} SET SCHEMA ${quoteIdent(newSchema)};`
    );
  }
  if ((original.comment ?? '').trim() !== draft.comment.trim()) {
    statements.push(commentStatement(draft, draft.comment));
  }
  return {
    ok: true,
    mode: statements.length === 0 ? 'none' : replaced ? 'replace' : 'alter',
    statements,
    transactional: true,
    warnings: [],
  };
}

export function dropRoutine(routine: RoutineDefinition): DdlResult {
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP ${keyword(routine.kind)} ${identity(routine)};`],
    transactional: true,
    warnings: [],
  };
}
