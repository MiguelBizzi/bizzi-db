import { DIALECTS } from '@db/database';
import type { TableSchema } from '../../../types';
import { qualifyTable as qualifyQuoted } from '../../schemaChange';
import type { DdlResult, ViewDraft } from '../types';

const { quoteIdent } = DIALECTS.MySQL;
const qualify = (schema: string, name: string) => qualifyQuoted(schema, name, quoteIdent);

export function emptyViewDraft(schema: string): ViewDraft {
  return {
    schema,
    name: '',
    materialized: false,
    definition: 'SELECT\n  \nFROM ',
    comment: '',
    withData: true,
    recreate: false,
    checkOption: false,
  };
}

function clean(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').trim();
}

function splitCheckOption(sql: string): { definition: string; checkOption: boolean } {
  const match = sql.match(/\s+WITH\s+(?:CASCADED\s+|LOCAL\s+)?CHECK OPTION\s*$/i);
  if (!match || match.index == null) return { definition: sql.trim(), checkOption: false };
  return { definition: sql.slice(0, match.index).trim(), checkOption: true };
}

export function viewDraftFrom(view: TableSchema): ViewDraft {
  const parsed = splitCheckOption(clean(view.viewSql ?? ''));
  return {
    ...emptyViewDraft(view.schema),
    name: view.name,
    definition: parsed.definition,
    checkOption: parsed.checkOption,
    sqlSecurity: view.sqlSecurity?.toUpperCase() === 'INVOKER' ? 'INVOKER' : undefined,
  };
}

export function validateView(draft: ViewDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.schema.trim()) errors.push('Schema is required.');
  if (!clean(draft.definition)) errors.push('Definition is required.');
  if (draft.materialized) errors.push('MySQL has no materialized views.');
  return errors;
}

function createStatement(draft: ViewDraft, schema = draft.schema, name = draft.name): string {
  const option = draft.checkOption ? '\nWITH CHECK OPTION' : '';
  const security = draft.sqlSecurity === 'INVOKER' ? ' SQL SECURITY INVOKER' : '';
  return `CREATE OR REPLACE${security} VIEW ${qualify(schema.trim(), name.trim())} AS\n${clean(draft.definition)}${option};`;
}

export function createView(draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const warnings = draft.comment.trim() ? ['MySQL views have no comment. The comment is not saved.'] : [];
  return { ok: true, mode: 'create', statements: [createStatement(draft)], transactional: false, warnings };
}

export function planViewChange(view: TableSchema, draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const renamed = draft.name.trim() !== view.name || draft.schema.trim() !== view.schema;
  if (renamed && clean(draft.definition) === clean(view.viewSql ?? '')) {
    return {
      ok: true,
      mode: 'alter',
      statements: [
        `RENAME TABLE ${qualify(view.schema, view.name)} TO ${qualify(draft.schema.trim(), draft.name.trim())};`,
      ],
      transactional: false,
      warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
    };
  }
  const statements = [createStatement(draft, view.schema, view.name)];
  if (renamed) {
    statements.push(
      `RENAME TABLE ${qualify(view.schema, view.name)} TO ${qualify(draft.schema.trim(), draft.name.trim())};`,
    );
  }
  return {
    ok: true,
    mode: 'replace',
    statements,
    transactional: false,
    warnings: ['CREATE OR REPLACE VIEW commits immediately.'],
  };
}

export function dropView(view: TableSchema): DdlResult {
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP VIEW ${qualify(view.schema, view.name)};`],
    transactional: false,
    warnings: ['MySQL commits this DDL immediately. It cannot be rolled back.'],
  };
}
