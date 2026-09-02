import type { Environment, SslMode } from '../types';

const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
  '0:0:0:0:0:0:0:1',
]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

export function defaultSslForHost(host: string): SslMode {
  const trimmed = host.trim();
  if (!trimmed) return 'disabled';
  return isLoopbackHost(trimmed) ? 'disabled' : 'require';
}

export function warnInsecureConnection(
  host: string,
  sslMode: SslMode,
  environment?: Environment,
): string | null {
  if (sslMode !== 'disabled' || isLoopbackHost(host)) return null;
  if (environment === 'production') {
    return 'Production connections should use SSL. Credentials and data will be sent in plaintext.';
  }
  return 'This host is not local. Enable SSL to encrypt credentials and data in transit.';
}
