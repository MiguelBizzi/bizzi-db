import { dialectModule } from '@db/database';
import type { DatabaseDialect } from '../types';

export function moduleFor(dialect: DatabaseDialect) {
  const meta = dialectModule(dialect);
  if (!meta) throw new Error(`${dialect} is not supported`);
  return meta;
}

export function ident(dialect: DatabaseDialect, name: string): string {
  return moduleFor(dialect).quoteIdent(name);
}

export function qualify(dialect: DatabaseDialect, schema: string, name: string): string {
  return schema ? `${ident(dialect, schema)}.${ident(dialect, name)}` : ident(dialect, name);
}

/** A text value, or `X'..'` / `'\x..'` when the cell is hex from a binary column. */
export function stringLiteral(dialect: DatabaseDialect, text: string): string {
  const hex = /^\\x([0-9A-Fa-f]+)$/.exec(text);
  if (hex) return moduleFor(dialect).byteaLiteral(hex[1]);
  return moduleFor(dialect).quoteLiteral(text);
}
