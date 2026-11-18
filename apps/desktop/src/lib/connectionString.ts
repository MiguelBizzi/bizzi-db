import { SUPPORTED_ENGINES, type EngineModule } from '@db/database';
import type { DatabaseDialect, SslMode } from '../types';
import {
  defaultConnectionForm,
  type ConnectionFormValues,
} from './connectionForm';
import { defaultSslForHost } from './connectionSecurity';

export type ParsedConnection = {
  dialect: DatabaseDialect;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslMode: SslMode;
  params: Record<string, string>;
};

export type ParseConnectionStringResult =
  | { ok: true; empty: true }
  | { ok: true; empty: false; value: ParsedConnection }
  | { ok: false; error: string };

const GENERIC_PARSE_ERROR =
  'Could not parse connection string. Please check the format.';

const UNSUPPORTED_SCHEMES: Record<string, string> = {
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  clickhouse: 'ClickHouse',
  duckdb: 'DuckDB',
};

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
      error: `${unsupported} is not supported yet. Choose a supported database or fill in the form manually.`,
    };
  }

  const meta = dialectForScheme(scheme);
  if (!meta) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }
  const dialect: DatabaseDialect = meta.id;

  if (meta.paradigm === 'document') {
    return parseDocumentUri(trimmed, meta);
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

  const port = url.port ? Number(url.port) : meta.defaultPort;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: GENERIC_PARSE_ERROR };
  }

  const pathDatabase = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  const database = params.get('dbname')?.trim() || params.get('database')?.trim() || pathDatabase;
  const username = params.get('user') ?? decodeComponent(url.username);
  const password = params.get('password') ?? decodeComponent(url.password);

  return {
    ok: true,
    empty: false,
    value: {
      dialect,
      host,
      port,
      username,
      password,
      database,
      sslMode: sslModeFromParams(params, host),
      params: {},
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
    dialect: parsed.dialect,
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    password: parsed.password,
    databaseName: parsed.database,
    sslMode: parsed.sslMode,
    params: parsed.params,
    name: replaceName ? `${parsed.database} @ ${parsed.host}` : form.name,
  };
}

function dialectForScheme(scheme: string) {
  const bare = scheme.startsWith('jdbc:') ? scheme.slice('jdbc:'.length) : scheme;
  return SUPPORTED_ENGINES.find((engine) => engine.uriSchemes.includes(bare));
}

const BOOLEAN_PARAMS_FALSE = new Set(['false', '0']);

/** Query keys read as SSL settings instead of connection params. */
const TLS_KEYS = new Set(['tls', 'ssl', 'tlsallowinvalidcertificates']);

/**
 * `new URL` cannot hold a comma-separated seed list in the authority, so the
 * document-engine URI is split by hand.
 */
function parseDocumentUri(raw: string, meta: EngineModule): ParseConnectionStringResult {
  const scheme = schemeOf(raw);
  const rest = raw.slice(scheme.length + 3);
  const authorityEnd = rest.search(/[/?]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd === -1 ? '' : rest.slice(authorityEnd);

  const at = authority.lastIndexOf('@');
  const userinfo = at === -1 ? '' : authority.slice(0, at);
  const hostList = (at === -1 ? authority : authority.slice(at + 1)).split(',');
  const colon = userinfo.indexOf(':');
  const username = decodeComponent(colon === -1 ? userinfo : userinfo.slice(0, colon));
  const password = colon === -1 ? '' : decodeComponent(userinfo.slice(colon + 1));

  const srv = scheme.endsWith('+srv');
  const endpoints = hostList.map(parseEndpoint);
  if (endpoints.some((e) => e === null)) return { ok: false, error: GENERIC_PARSE_ERROR };
  const [first, ...others] = endpoints as { host: string; port: number | null }[];
  if (srv) {
    if (first.port !== null || others.length > 0) {
      return { ok: false, error: `${scheme} URIs take a single host without a port.` };
    }
  }
  const port = first.port ?? meta.defaultPort;
  if (port < 1 || port > 65535) return { ok: false, error: GENERIC_PARSE_ERROR };

  const queryStart = tail.indexOf('?');
  const path = queryStart === -1 ? tail : tail.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? '' : tail.slice(queryStart + 1));
  const database = decodeComponent(path.replace(/^\/+/, '').split('/')[0] ?? '');

  const params: Record<string, string> = {};
  if (srv) params.srv = 'true';
  if (others.length > 0) {
    params.hosts = others.map((e) => `${e.host}:${e.port ?? meta.defaultPort}`).join(',');
  }

  const queryParams = new Map(
    meta.connectionParams
      .filter((spec) => spec.key !== 'srv' && spec.key !== 'hosts')
      .map((spec) => [spec.key.toLowerCase(), spec] as const),
  );
  const tls = new Map<string, string>();
  for (const [key, value] of query) {
    const lower = key.toLowerCase();
    if (TLS_KEYS.has(lower)) {
      tls.set(lower, value.trim().toLowerCase());
      continue;
    }
    const spec = queryParams.get(lower);
    if (!spec) {
      return {
        ok: false,
        error: `Unsupported option ${key}. Remove it or set it after connecting.`,
      };
    }
    if (spec.kind === 'boolean') {
      if (!BOOLEAN_PARAMS_FALSE.has(value.toLowerCase()) && value !== '') params[spec.key] = 'true';
    } else if (value !== '') {
      params[spec.key] = value;
    }
  }

  return {
    ok: true,
    empty: false,
    value: {
      dialect: meta.id,
      host: first.host,
      port,
      username,
      password,
      database,
      sslMode: documentSslMode(tls, srv, first.host),
      params,
    },
  };
}

function parseEndpoint(entry: string): { host: string; port: number | null } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : null };
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon === -1) return { host: trimmed, port: null };
  const port = trimmed.slice(colon + 1);
  if (!/^\d+$/.test(port)) return null;
  const host = trimmed.slice(0, colon);
  return host ? { host: decodeComponent(host), port: Number(port) } : null;
}

function documentSslMode(tls: Map<string, string>, srv: boolean, host: string): SslMode {
  const flag = tls.get('tls') ?? tls.get('ssl');
  if (flag === 'false') return 'disabled';
  if (flag === 'true') {
    return tls.get('tlsallowinvalidcertificates') === 'true' ? 'require' : 'enabled';
  }
  // Atlas (SRV) clusters only accept TLS.
  return srv ? 'enabled' : defaultSslForHost(host);
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
