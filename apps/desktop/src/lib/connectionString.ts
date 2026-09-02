import type { SslMode } from '../types';
import {
  defaultConnectionForm,
  type ConnectionFormValues,
} from './connectionForm';
import { defaultSslForHost } from './connectionSecurity';

export type ParsedConnection = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslMode: SslMode;
};

export type ParseConnectionStringResult =
  | { ok: true; empty: true }
  | { ok: true; empty: false; value: ParsedConnection }
  | { ok: false; error: string };

const GENERIC_PARSE_ERROR =
  'Could not parse connection string. Please check the format.';

const DEFAULT_PORT = 5432;

const UNSUPPORTED_SCHEMES: Record<string, string> = {
  mysql: 'MySQL',
  mysql2: 'MySQL',
  mariadb: 'MySQL',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
  'mongodb+srv': 'MongoDB',
  clickhouse: 'ClickHouse',
  duckdb: 'DuckDB',
};

const POSTGRES_SCHEMES = new Set(['postgres', 'postgresql', 'jdbc:postgresql']);

export function parseConnectionString(raw: string): ParseConnectionStringResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, empty: true };

  const scheme = schemeOf(trimmed);
  if (!scheme) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const unsupported = UNSUPPORTED_SCHEMES[scheme];
  if (unsupported) {
    return {
      ok: false,
      error: `${unsupported} is not supported yet. Choose PostgreSQL or fill in the form manually.`,
    };
  }

  if (!POSTGRES_SCHEMES.has(scheme)) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const normalized = trimmed.toLowerCase().startsWith('jdbc:')
    ? trimmed.slice('jdbc:'.length)
    : trimmed;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const params = url.searchParams;
  const host = unwrapIpv6Host(url.hostname || params.get('host')?.trim() || '');
  if (!host) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const port = url.port ? Number(url.port) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const pathDatabase = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  const database = params.get('dbname')?.trim() || pathDatabase;
  const username = params.get('user') ?? decodeComponent(url.username);
  const password = params.get('password') ?? decodeComponent(url.password);

  return {
    ok: true,
    empty: false,
    value: {
      host,
      port,
      username,
      password,
      database,
      sslMode: sslModeFromParams(params, host),
    },
  };
}

export function applyParsedConnection(
  form: ConnectionFormValues,
  parsed: ParsedConnection,
): ConnectionFormValues {
  const defaultName = defaultConnectionForm().name;
  const replaceName = !form.name.trim() || form.name === defaultName;
  return {
    ...form,
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    password: parsed.password,
    databaseName: parsed.database,
    sslMode: parsed.sslMode,
    name: replaceName ? `${parsed.database} @ ${parsed.host}` : form.name,
  };
}

function unwrapIpv6Host(host: string): string {
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

function schemeOf(raw: string): string {
  const idx = raw.indexOf('://');
  if (idx <= 0) return '';
  return raw.slice(0, idx).toLowerCase();
}

function decodeComponent(value: string): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sslModeFromParams(params: URLSearchParams, host: string): SslMode {
  const sslmode = params.get('sslmode')?.trim().toLowerCase();
  if (sslmode === 'disable' || sslmode === 'disabled') return 'disabled';
  if (
    sslmode === 'require' ||
    sslmode === 'allow' ||
    sslmode === 'prefer'
  ) {
    return 'require';
  }
  if (sslmode === 'verify-ca' || sslmode === 'verify-full') return 'enabled';

  const ssl = params.get('ssl')?.trim().toLowerCase();
  if (ssl === 'true' || ssl === '1' || ssl === 'require') return 'require';
  if (ssl === 'false' || ssl === '0' || ssl === 'disable') return 'disabled';

  return defaultSslForHost(host);
}
