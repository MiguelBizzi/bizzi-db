import { DIALECTS } from '@db/database';
import type { RoutineDefinition, RoutineKind } from '../../../types';
import { qualifyTable as qualifyQuoted } from '../../schemaChange';
import type { DdlResult, RoutineDraft } from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.SQLServer;
const qualify = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);
const caps = DIALECTS.SQLServer.objects.routines;

export function emptyRoutineDraft(schema: string, kind: RoutineKind): RoutineDraft {
  return {
    schema,
    name: '',
    kind,
    parameters: [],
    returns: { kind: 'type', type: 'int', setOf: false },
    language: caps.defaultLanguage,
    body: kind === 'function' ? 'RETURN NULL' : 'SELECT 1',
    volatility: 'volatile',
    strict: false,
    securityDefiner: false,
    parallel: '',
    leakproof: false,
    cost: '',
    rows: '',
    comment: '',
  };
}

export function routineDraftFrom(routine: RoutineDefinition, body: string): RoutineDraft {
  return {
    ...emptyRoutineDraft(routine.schema, routine.kind),
    name: routine.name,
    parameters: routine.parameters.map((param) => ({
      mode: param.mode === 'out' || param.mode === 'inout' ? 'out' : 'in',
      name: param.name.replace(/^@/, ''),
      dataType: param.dataType,
      default: param.default ?? '',
    })),
    returns: { kind: 'type', type: routine.returnType ?? 'int', setOf: routine.returnsSet },
    body,
    securityDefiner: routine.securityDefiner,
    comment: routine.comment ?? '',
  };
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
    errors.push('Function parameters are input only. Use a procedure for OUTPUT.');
  }
  if (draft.language.trim().toUpperCase() !== 'T-SQL') errors.push('SQL Server routines in this app are T-SQL.');
  return errors;
}

function paramSql(draft: RoutineDraft): string {
  return draft.parameters
    .map((param) => {
      const output = draft.kind === 'procedure' && param.mode === 'out' ? ' OUTPUT' : '';
      const fallback = param.default.trim() ? ` = ${param.default.trim()}` : '';
      return `@${param.name.trim().replace(/^@/, '')} ${param.dataType.trim()}${fallback}${output}`;
    })
    .join(', ');
}

function bodySql(body: string): string {
  const trimmed = body.trim().replace(/;+\s*$/, '');
  if (/^begin\b/i.test(trimmed)) return trimmed;
  return `BEGIN\n${trimmed}\nEND`;
}

function createStatement(draft: RoutineDraft): string {
  const qualified = qualify(draft.schema.trim(), draft.name.trim());
  const params = paramSql(draft);
  const executeAs = draft.securityDefiner ? '\nWITH EXECUTE AS OWNER' : '';
  if (draft.kind === 'procedure') {
    const list = params ? `\n  ${params}` : '';
    return `CREATE OR ALTER PROCEDURE ${qualified}${list}${executeAs}\nAS\n${bodySql(draft.body)}`;
  }
  const returns = draft.returns.kind === 'type' ? draft.returns.type.trim() : 'int';
  return `CREATE OR ALTER FUNCTION ${qualified}(${params})\nRETURNS ${returns}${executeAs}\nAS\n${bodySql(draft.body)}`;
}

export function planCreateRoutine(draft: RoutineDraft, _orReplace: boolean): DdlResult {
  return createRoutine(draft);
}

export function createRoutine(draft: RoutineDraft): DdlResult {
  const errors = validateRoutine(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  return { ok: true, mode: 'create', statements: [createStatement(draft)], transactional: true, warnings: [] };
}

export function planRoutineChange(original: RoutineDefinition, _body: string, draft: RoutineDraft): DdlResult {
  const errors = validateRoutine(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const statements = [createStatement(draft)];
  if (draft.name.trim() !== original.name) {
    const old = `${quoteIdent(original.schema)}.${quoteIdent(original.name)}`;
    statements.unshift(`EXEC sp_rename ${quoteLiteral(old)}, ${quoteLiteral(draft.name.trim())}, N'OBJECT';`);
  }
  return { ok: true, mode: 'alter', statements, transactional: true, warnings: [] };
}

export function dropRoutine(routine: RoutineDefinition): DdlResult {
  const kind = routine.kind === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP ${kind} ${qualify(routine.schema, routine.name)};`],
    transactional: true,
    warnings: [],
  };
}
