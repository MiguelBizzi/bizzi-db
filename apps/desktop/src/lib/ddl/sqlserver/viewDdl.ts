import { DIALECTS } from '@db/database';
import type { TableSchema } from '../../../types';
import { qualifyTable as qualifyQuoted } from '../../schemaChange';
import type { DdlResult, ViewDraft } from '../types';

const { quoteIdent, quoteLiteral } = DIALECTS.SQLServer;
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

export function viewDraftFrom(view: TableSchema): ViewDraft {
  return {
    ...emptyViewDraft(view.schema),
    name: view.name,
    definition: clean(view.viewSql ?? ''),
  };
}

export function validateView(draft: ViewDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.schema.trim()) errors.push('Schema is required.');
  if (!clean(draft.definition)) errors.push('Definition is required.');
  if (draft.materialized) errors.push('Indexed views are not edited here.');
  return errors;
}

function createStatement(draft: ViewDraft): string {
  return `CREATE OR ALTER VIEW ${qualify(draft.schema.trim(), draft.name.trim())}\nAS\n${clean(draft.definition)};`;
}

export function planCreateView(draft: ViewDraft, _orReplace: boolean): DdlResult {
  return createView(draft);
}

export function createView(draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  return { ok: true, mode: 'create', statements: [createStatement(draft)], transactional: true, warnings: [] };
}

export function planViewChange(view: TableSchema, draft: ViewDraft): DdlResult {
  const errors = validateView(draft);
  if (errors.length > 0) return { ok: false, reason: errors[0] };
  const statements: string[] = [];
  const renamed = draft.name.trim() !== view.name || draft.schema.trim() !== view.schema;
  if (renamed && clean(draft.definition) === clean(view.viewSql ?? '')) {
    const old = `${quoteIdent(view.schema)}.${quoteIdent(view.name)}`;
    statements.push(
      `EXEC sp_rename ${quoteLiteral(old)}, ${quoteLiteral(draft.name.trim())}, N'OBJECT';`,
    );
    return { ok: true, mode: 'alter', statements, transactional: true, warnings: [] };
  }
  statements.push(createStatement({ ...draft, schema: view.schema, name: view.name }));
  if (renamed) {
    const old = `${quoteIdent(view.schema)}.${quoteIdent(view.name)}`;
    statements.push(`EXEC sp_rename ${quoteLiteral(old)}, ${quoteLiteral(draft.name.trim())}, N'OBJECT';`);
  }
  return { ok: true, mode: 'replace', statements, transactional: true, warnings: [] };
}

export function dropView(view: TableSchema): DdlResult {
  return {
    ok: true,
    mode: 'drop',
    statements: [`DROP VIEW ${qualify(view.schema, view.name)};`],
    transactional: true,
    warnings: [],
  };
}
