import { DIALECTS } from '@db/database';
import type { RoutineDefinition, RoutineKind } from '../../../types';
import { qualifyTable as qualifyQuoted } from '../../schemaChange';
import type { DdlResult, RoutineDraft } from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.MySQL;
const qualify = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);
const caps = DIALECTS.MySQL.objects.routines;
const NOT_ATOMIC =
  'The new body is created under a temporary name first. If that fails, the original routine is left in place. MySQL still commits each statement immediately.';
const BINLOG_WARNING =
  'A binary-logged server rejects this function (errno 1418) unless it is DETERMINISTIC, or NO SQL, or READS SQL DATA.';

export function emptyRoutineDraft(schema: string, kind: RoutineKind): RoutineDraft {
  return {
    schema,
    name: '',
    kind,
    parameters: [],
    returns: { kind: 'type', type: 'INT', setOf: false },
    language: caps.defaultLanguage,
    body: kind === 'function' ? 'RETURN NULL' : 'BEGIN\n  \nEND',
    volatility: 'volatile',
    strict: false,
    securityDefiner: false,
    parallel: '',
    leakproof: false,
    cost: '',
    rows: '',
    comment: '',
    dataAccess: kind === 'function' ? 'READS SQL DATA' : 'MODIFIES SQL DATA',
  };
}

export function routineDraftFrom(routine: RoutineDefinition, body: string): RoutineDraft {
  return {
    ...emptyRoutineDraft(routine.schema, routine.kind),
    name: routine.name,
    parameters: routine.parameters.map((param) => ({
      mode: param.mode === 'out' || param.mode === 'inout' ? param.mode : 'in',
      name: param.name,
      dataType: param.dataType,
      default: param.default ?? '',
    })),
    returns: { kind: 'type', type: routine.returnType ?? 'INT', setOf: false },
    body,
    volatility: routine.volatility === 'immutable' ? 'immutable' : 'volatile',
    securityDefiner: routine.securityDefiner,
    comment: routine.comment ?? '',
    dataAccess: dataAccessOf(routine.dataAccess, routine.kind),
  };
}

function dataAccessOf(
  value: string | undefined,
  kind: RoutineDraft['kind'],
): RoutineDraft['dataAccess'] {
  if (
    value === 'CONTAINS SQL' ||
    value === 'NO SQL' ||
    value === 'READS SQL DATA' ||
    value === 'MODIFIES SQL DATA'
  ) {
    return value;
  }
  return kind === 'function' ? 'READS SQL DATA' : 'MODIFIES SQL DATA';
}

function binlogWarning(draft: RoutineDraft): string | undefined {
  if (draft.kind !== 'function' || draft.volatility === 'immutable') return undefined;
  if (draft.dataAccess === 'NO SQL' || draft.dataAccess === 'READS SQL DATA') return undefined;
  return BINLOG_WARNING;
}

export function validateRoutine(draft: RoutineDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.schema.trim()) errors.push('Schema is required.');
  if (draft.kind === 'function' && (draft.returns.kind !== 'type' || !draft.returns.type.trim())) {
    errors.push('Functions need a return type.');
  }
  if (!draft.body.trim()) errors.push('Body is required.');
  if (draft.kind === 'function' && draft.parameters.some((param) => param.mode !== 'in')) {
    errors.push('Function parameters are IN only.');
  }
  if (draft.language.trim().toUpperCase() !== 'SQL') errors.push('MySQL routines in this app are SQL.');
  return errors;
}

function paramSql(draft: RoutineDraft): string {
  return draft.parameters
    .map((param) => {
      const mode = draft.kind === 'procedure' ? `${param.mode.toUpperCase()} ` : '';
      return `${mode}${quoteIdent(param.name.trim())} ${param.dataType.trim()}`;
    })
    .join(', ');
}

function characteristics(draft: RoutineDraft): string {
  const parts: string[] = [];
  if (draft.kind === 'function' && draft.volatility === 'immutable') parts.push('DETERMINISTIC');
  if (draft.dataAccess) parts.push(draft.dataAccess);
  parts.push(draft.securityDefiner ? 'SQL SECURITY DEFINER' : 'SQL SECURITY INVOKER');
  if (draft.comment.trim()) parts.push(`COMMENT ${quoteLiteral(draft.comment.trim())}`);
  return parts.join('\n');
}

function tempRoutineName(name: string): string {
  const suffix = '__bnew';
  const room = 64 - suffix.length;
  const base = name.length > room ? name.slice(0, room) : name;
  return `${base}${suffix}`;
}

function createStatement(draft: RoutineDraft, name = draft.name.trim()): string {
  const qualified = qualify(draft.schema.trim(), name);
  const params = paramSql(draft);
  const header =
    draft.kind === 'function'
      ? `CREATE FUNCTION ${qualified} (${params})\nRETURNS ${draft.returns.kind === 'type' ? draft.returns.type.trim() : 'INT'}`
      : `CREATE PROCEDURE ${qualified} (${params})`;
  return `${header}\n${characteristics(draft)}\n${draft.body.trim()}`;
}

export function createRoutine(draft: RoutineDraft): DdlResult {
  const errors = validateRoutine(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const statement = createStatement(draft);
  const warning = binlogWarning(draft);
  return {
    ok: true,
    mode: 'create',
    statements: [`DELIMITER $$\n${statement}$$\nDELIMITER ;`],
    transactional: false,
    warnings: warning ? [warning] : [],
  };
}

export function planRoutineChange(original: RoutineDefinition, _body: string, draft: RoutineDraft): DdlResult {
  const errors = validateRoutine(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const kind = original.kind === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
  const temp = tempRoutineName(original.name);
  const probe = createStatement(draft, temp);
  const drop = `DROP ${kind} IF EXISTS ${qualify(original.schema, original.name)}`;
  const statement = createStatement(draft);
  const dropTemp = `DROP ${kind} IF EXISTS ${qualify(original.schema, temp)}`;
  const warning = binlogWarning(draft);
  return {
    ok: true,
    mode: 'recreate',
    statements: [`DELIMITER $$\n${probe}$$\n${drop}$$\n${statement}$$\n${dropTemp}$$\nDELIMITER ;`],
    transactional: false,
    warnings: warning ? [NOT_ATOMIC, warning] : [NOT_ATOMIC],
  };
}

export function dropRoutine(routine: RoutineDefinition): DdlResult {
  const kind = routine.kind === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP ${kind} IF EXISTS ${qualify(routine.schema, routine.name)};`],
    transactional: false,
    warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
  };
}
