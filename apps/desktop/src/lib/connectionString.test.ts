import { describe, expect, test } from 'bun:test';
import { defaultConnectionForm } from './connectionForm';
import {
  applyParsedConnection,
  parseConnectionString,
} from './connectionString';

describe('parseConnectionString', () => {
  test('treats blank input as empty so the manual form stays in use', () => {
    expect(parseConnectionString('')).toEqual({ ok: true, empty: true });
    expect(parseConnectionString('   ')).toEqual({ ok: true, empty: true });
  });

  test('parses a full postgresql URI with encoded password and sslmode', () => {
    const result = parseConnectionString(
      'postgresql://user:p%40ss@db.example.com:6543/app?sslmode=require',
    );
    expect(result).toEqual({
      ok: true,
      empty: false,
      value: {
        host: 'db.example.com',
        port: 6543,
        username: 'user',
        password: 'p@ss',
        database: 'app',
        sslMode: 'require',
      },
    });
  });

  test('parses postgres:// with default port and empty password', () => {
    const result = parseConnectionString('postgres://alice@localhost/shop');
    expect(result).toEqual({
      ok: true,
      empty: false,
      value: {
        host: 'localhost',
        port: 5432,
        username: 'alice',
        password: '',
        database: 'shop',
        sslMode: 'disabled',
      },
    });
  });

  test('parses IPv6 hosts', () => {
    const result = parseConnectionString(
      'postgresql://user:secret@[::1]:5432/app',
    );
    expect(result).toEqual({
      ok: true,
      empty: false,
      value: {
        host: '::1',
        port: 5432,
        username: 'user',
        password: 'secret',
        database: 'app',
        sslMode: 'disabled',
      },
    });
  });

  test('parses JDBC URIs with user, password, and dbname query params', () => {
    const result = parseConnectionString(
      'jdbc:postgresql://db.example.com:5432/ignored?user=app_user&password=s3cret&dbname=app&sslmode=verify-full',
    );
    expect(result).toEqual({
      ok: true,
      empty: false,
      value: {
        host: 'db.example.com',
        port: 5432,
        username: 'app_user',
        password: 's3cret',
        database: 'app',
        sslMode: 'enabled',
      },
    });
  });

  test('uses the pathname database when JDBC dbname is absent', () => {
    const result = parseConnectionString(
      'jdbc:postgresql://db.example.com/app?user=app_user&password=s3cret',
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.empty) throw new Error('expected parse');
    expect(result.value.database).toBe('app');
    expect(result.value.username).toBe('app_user');
    expect(result.value.sslMode).toBe('require');
  });

  test('requires SSL on remote hosts when sslmode is omitted', () => {
    const result = parseConnectionString(
      'postgresql://user:secret@db.example.com/app',
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.empty) throw new Error('expected parse');
    expect(result.value.sslMode).toBe('require');
  });

  test('honors explicit sslmode=disable on a remote host', () => {
    const result = parseConnectionString(
      'postgresql://user:secret@db.example.com/app?sslmode=disable',
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.empty) throw new Error('expected parse');
    expect(result.value.sslMode).toBe('disabled');
  });

  test('maps ssl=true and allow/prefer to require, verify-ca to enabled', () => {
    expect(
      parseConnectionString('postgresql://u:p@h/db?ssl=true'),
    ).toMatchObject({
      ok: true,
      empty: false,
      value: { sslMode: 'require' },
    });
    expect(
      parseConnectionString('postgresql://u:p@h/db?sslmode=prefer'),
    ).toMatchObject({
      ok: true,
      empty: false,
      value: { sslMode: 'require' },
    });
    expect(
      parseConnectionString('postgresql://u:p@h/db?sslmode=verify-ca'),
    ).toMatchObject({
      ok: true,
      empty: false,
      value: { sslMode: 'enabled' },
    });
  });

  test('reads a unix socket host from the host query param', () => {
    const result = parseConnectionString(
      'postgresql:///mydb?host=/var/run/postgresql',
    );
    expect(result).toEqual({
      ok: true,
      empty: false,
      value: {
        host: '/var/run/postgresql',
        port: 5432,
        username: '',
        password: '',
        database: 'mydb',
        sslMode: 'require',
      },
    });
  });

  test('rejects unsupported engines with an actionable message', () => {
    const cases = [
      ['mysql://root@localhost/app', 'MySQL'],
      ['mysql2://root@localhost/app', 'MySQL'],
      ['mariadb://root@localhost/app', 'MySQL'],
      ['sqlite:///tmp/app.db', 'SQLite'],
      ['mongodb://localhost:27017/app', 'MongoDB'],
      ['mongodb+srv://cluster.example.com/app', 'MongoDB'],
      ['clickhouse://localhost/app', 'ClickHouse'],
      ['duckdb:///tmp/app.duckdb', 'DuckDB'],
    ] as const;

    for (const [uri, engine] of cases) {
      expect(parseConnectionString(uri)).toEqual({
        ok: false,
        error: `${engine} is not supported yet. Choose PostgreSQL or fill in the form manually.`,
      });
    }
  });

  test('rejects garbage and missing-host URIs', () => {
    const message =
      'Could not parse connection string. Please check the format.';
    expect(parseConnectionString('not-a-uri')).toEqual({
      ok: false,
      error: message,
    });
    expect(parseConnectionString('redis://localhost:6379/0')).toEqual({
      ok: false,
      error: message,
    });
    expect(parseConnectionString('postgresql:///mydb')).toEqual({
      ok: false,
      error: message,
    });
  });
});

describe('applyParsedConnection', () => {
  test('fills connection fields and replaces the default display name', () => {
    const form = defaultConnectionForm();
    const next = applyParsedConnection(form, {
      host: 'db.example.com',
      port: 6543,
      username: 'app_user',
      password: 's3cret',
      database: 'app',
      sslMode: 'require',
    });
    expect(next.host).toBe('db.example.com');
    expect(next.port).toBe(6543);
    expect(next.username).toBe('app_user');
    expect(next.password).toBe('s3cret');
    expect(next.databaseName).toBe('app');
    expect(next.sslMode).toBe('require');
    expect(next.name).toBe('app @ db.example.com');
    expect(next.poolSize).toBe(form.poolSize);
    expect(next.environment).toBe(form.environment);
  });

  test('preserves folder, SSH, and a custom display name', () => {
    const form = {
      ...defaultConnectionForm(),
      name: 'Prod replica',
      folderId: 'folder_9',
      environment: 'production' as const,
      poolSize: 12,
      sshEnabled: true,
      sshHost: 'bastion.example.com',
      sshPort: 2222,
      sshUser: 'jump',
      sshAuth: 'privateKey' as const,
      sshKeyPath: '/tmp/id_ed25519',
    };
    const next = applyParsedConnection(form, {
      host: 'db.example.com',
      port: 5432,
      username: 'app_user',
      password: 's3cret',
      database: 'app',
      sslMode: 'enabled',
    });
    expect(next.name).toBe('Prod replica');
    expect(next.folderId).toBe('folder_9');
    expect(next.environment).toBe('production');
    expect(next.poolSize).toBe(12);
    expect(next.sshEnabled).toBe(true);
    expect(next.sshHost).toBe('bastion.example.com');
    expect(next.sshPort).toBe(2222);
    expect(next.sshUser).toBe('jump');
    expect(next.sshAuth).toBe('privateKey');
    expect(next.sshKeyPath).toBe('/tmp/id_ed25519');
  });
});
