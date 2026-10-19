import { DIALECTS } from '@db/database';
import type { TableSchema } from '../../../types';
import { qualifyTable } from '../../schemaChange';
import type { DdlResult, ViewDraft } from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.PostgreSQL;
const MAX_NAME_BYTES = 63;

export function emptyViewDraft(schema: string): ViewDraft {
  return {
    schema,
    name: '',
    materialized: false,
    definition: 'SELECT\n  \nFROM ',
    comment: '',
    withData: true,
    recreate: false,
  };
}

function cleanDefinition(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').trim();
}

function sameDefinition(a: string, b: string): boolean {
  const norm = (sql: string) => cleanDefinition(sql).replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}

export function viewDraftFrom(view: TableSchema): ViewDraft {
  return {
    schema: view.schema,
    name: view.name,
    materialized: Boolean(view.isMaterialized),
    definition: cleanDefinition(view.viewSql ?? ''),
    comment: view.description ?? '',
    withData: true,
    recreate: false,
  };
}

export function validateView(draft: ViewDraft): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Name is required.');
  else if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) {
    errors.push(`Name is longer than ${MAX_NAME_BYTES} bytes.`);
  }
  if (!draft.schema.trim()) errors.push('Schema is required.');
  if (!cleanDefinition(draft.definition)) errors.push('Definition is required.');
  return errors;
}

function word(materialized: boolean): string {
  return materialized ? 'MATERIALIZED VIEW' : 'VIEW';
}

function createStatement(draft: ViewDraft, orReplace = false, schema = draft.schema, name = draft.name) {
  const head = `CREATE ${orReplace ? 'OR REPLACE ' : ''}${word(draft.materialized)} ${qualifyTable(schema.trim(), name.trim())} AS`;
  const noData = draft.materialized && !draft.withData ? '\nWITH NO DATA' : '';
  return `${head}\n${cleanDefinition(draft.definition)}${noData};`;
}

function commentStatement(draft: ViewDraft): string {
  const value = draft.comment.trim() ? quoteLiteral(draft.comment.trim()) : 'NULL';
  return `COMMENT ON ${word(draft.materialized)} ${qualifyTable(draft.schema.trim(), draft.name.trim())} IS ${value};`;
}

function refuse(reason: string): DdlResult {
  return { ok: false, reason };
}

export function createView(draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return refuse(errors[0]);
  const statements = [createStatement(draft)];
  if (draft.comment.trim()) statements.push(commentStatement(draft));
  return { ok: true, mode: 'create', statements, transactional: true, warnings: [] };
}

/**
 * A plain view's SELECT changes with CREATE OR REPLACE, which only accepts
 * new columns at the end; a materialized view has no OR REPLACE and is rebuilt.
 */
export function planViewChange(view: TableSchema, draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return refuse(errors[0]);
  const before = viewDraftFrom(view);
  const materialized = before.materialized;
  const target = { ...draft, materialized };
  const kind = word(materialized);
  const oldName = qualifyTable(view.schema, view.name);
  const newName = draft.name.trim();
  const newSchema = draft.schema.trim();
  const definitionChanged = !sameDefinition(before.definition, draft.definition);
  const commentChanged = before.comment.trim() !== draft.comment.trim();

  if (definitionChanged && (materialized || draft.recreate)) {
    const statements = [`DROP ${kind} ${oldName};`, createStatement(target)];
    if (draft.comment.trim()) statements.push(commentStatement(target));
    return {
      ok: true,
      mode: 'recreate',
      statements,
      transactional: true,
      warnings: [
        materialized
          ? 'A materialized view cannot be redefined in place, so it is dropped and rebuilt in one transaction. Its indexes are dropped with it; recreate them afterwards.'
          : 'The view is dropped and recreated in one transaction.',
        'The drop fails if other views or functions depend on it, and privileges granted on it are lost.',
      ],
    };
  }

  const statements: string[] = [];
  const warnings: string[] = [];
  if (definitionChanged) {
    statements.push(createStatement(target, true, view.schema, view.name));
    warnings.push(
      'CREATE OR REPLACE VIEW keeps existing columns: it can add columns at the end but cannot remove, rename or retype them. If PostgreSQL rejects the change, use Drop and recreate.'
    );
  }
  if (newName !== view.name) statements.push(`ALTER ${kind} ${oldName} RENAME TO ${quoteIdent(newName)};`);
  if (newSchema !== view.schema) {
    statements.push(`ALTER ${kind} ${qualifyTable(view.schema, newName)} SET SCHEMA ${quoteIdent(newSchema)};`);
  }
  if (commentChanged) statements.push(commentStatement(target));
  return {
    ok: true,
    mode: statements.length === 0 ? 'none' : definitionChanged ? 'replace' : 'alter',
    statements,
    transactional: true,
    warnings,
  };
}

export function dropView(view: TableSchema): DdlResult {
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP ${word(Boolean(view.isMaterialized))} ${qualifyTable(view.schema, view.name)};`],
    transactional: true,
    warnings: [],
  };
}
