import type { DatabaseDialect } from '@db/shared';

export {
  columnTypesFor,
  type ColumnTypeDef,
  type ColumnTypeFamily,
  type ColumnTypeParams,
} from './columnTypes';

export interface DialectMeta {
  id: DatabaseDialect;
  label: string;
  defaultPort: number;
  defaultSsl: boolean;
  quoteIdent: (name: string) => string;
}

function quoteSqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const DIALECTS: Record<'PostgreSQL', DialectMeta> = {
  PostgreSQL: {
    id: 'PostgreSQL',
    label: 'PostgreSQL',
    defaultPort: 5432,
    defaultSsl: false,
    quoteIdent: quoteSqlIdent,
  },
};

export const SUPPORTED_DIALECTS: DialectMeta[] = [DIALECTS.PostgreSQL];

export function dialectMeta(id: DatabaseDialect): DialectMeta | undefined {
  if (id === 'PostgreSQL') return DIALECTS.PostgreSQL;
  return undefined;
}
