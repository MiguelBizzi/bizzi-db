import { describe, expect, test } from 'bun:test';
import type { ConnectionProfile } from '../types';
import {
  connectionFormErrors,
  connectionFormFromProfile,
  connectionFormToInput,
  connectionModalCopy,
  defaultConnectionForm,
  firstTabWithErrors,
  paramsForInput,
  shouldConnectAfterSave,
  visibleConnectionFields,
  applyDialectDefaults,
  credentialsRequired,
} from './connectionForm';
import { engineMeta } from '@db/database';

function profile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: 'conn_1',
    name: 'Prod DB',
    dialect: 'PostgreSQL',
    host: 'db.example.com',
    port: 6543,
    database: 'app',
    user: 'app_user',
    sslMode: 'require',
    poolSize: 12,
    environment: 'production',
    status: 'disconnected',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuth: 'password',
    sshKeyPath: null,
    ...overrides,
  };
}

describe('defaultConnectionForm', () => {
  test('starts with local postgres defaults and SSL off', () => {
    const form = defaultConnectionForm();
    expect(form.name).toBe('Local PostgreSQL');
    expect(form.host).toBe('127.0.0.1');
    expect(form.port).toBe(5432);
    expect(form.sslMode).toBe('disabled');
    expect(form.password).toBe('');
    expect(form.sshEnabled).toBe(false);
    expect(form.sshPort).toBe(22);
    expect(form.sshAuth).toBe('password');
  });
});

describe('connectionFormFromProfile', () => {
  test('pre-fills every visible field and leaves secrets blank', () => {
    const form = connectionFormFromProfile(profile());
    expect(form).toEqual({
      dialect: 'PostgreSQL',
      name: 'Prod DB',
      host: 'db.example.com',
      port: 6543,
      databaseName: 'app',
      username: 'app_user',
      password: '',
      sslMode: 'require',
      poolSize: 12,
      environment: 'production',
      folderId: '',
      sshEnabled: false,
      sshHost: '',
      sshPort: 22,
      sshUser: '',
      sshAuth: 'password',
      sshPassword: '',
      sshKeyPath: '',
      sshPassphrase: '',
      params: {},
    });
  });

  test('copies the connection folder id and SSH settings', () => {
    const form = connectionFormFromProfile(
      profile({
        folderId: 'folder_9',
        sshEnabled: true,
        sshHost: 'bastion.example.com',
        sshPort: 2222,
        sshUser: 'jump',
        sshAuth: 'privateKey',
        sshKeyPath: '/tmp/id_ed25519',
      }),
    );
    expect(form.folderId).toBe('folder_9');
    expect(form.sshEnabled).toBe(true);
    expect(form.sshHost).toBe('bastion.example.com');
    expect(form.sshPort).toBe(2222);
    expect(form.sshUser).toBe('jump');
    expect(form.sshAuth).toBe('privateKey');
    expect(form.sshKeyPath).toBe('/tmp/id_ed25519');
    expect(form.sshPassword).toBe('');
    expect(form.sshPassphrase).toBe('');
  });
});

describe('connectionFormErrors', () => {
  test('requires password only when creating a connection', () => {
    const values = defaultConnectionForm();
    expect(
      connectionFormErrors(values, { passwordRequired: true, keychainEnabled: false })
        .password,
    ).toBe('Required');
    expect(
      connectionFormErrors(values, {
        passwordRequired: false,
        keychainEnabled: false,
      }).password,
    ).toBeUndefined();
  });

  test('rejects empty required fields and out-of-range numbers', () => {
    const errors = connectionFormErrors(
      {
        name: '  ',
        host: '',
        port: 0,
        databaseName: '',
        username: '',
        password: 'secret',
        sslMode: 'disabled',
        poolSize: 99,
        environment: 'development',
        folderId: '',
        sshEnabled: false,
        sshHost: '',
        sshPort: 22,
        sshUser: '',
        sshAuth: 'password',
        sshPassword: '',
        sshKeyPath: '',
        sshPassphrase: '',
        params: {},
      },
      { passwordRequired: true, keychainEnabled: false },
    );
    expect(errors.name).toBe('Required');
    expect(errors.host).toBe('Required');
    expect(errors.port).toBe('Enter a port from 1 to 65535');
    expect(errors.databaseName).toBe('Required');
    expect(errors.username).toBe('Required');
    expect(errors.poolSize).toBe('Enter a pool size from 1 to 32');
  });

  test('requires SSH host, port, and user when tunneling is on', () => {
    const errors = connectionFormErrors(
      {
        ...defaultConnectionForm(),
        password: 'secret',
        sshEnabled: true,
        sshHost: '  ',
        sshPort: 0,
        sshUser: '',
        sshAuth: 'privateKey',
        sshKeyPath: '',
      },
      { passwordRequired: true, keychainEnabled: true },
    );
    expect(errors.sshHost).toBe('Required');
    expect(errors.sshPort).toBe('Enter a port from 1 to 65535');
    expect(errors.sshUser).toBe('Required');
    expect(errors.sshKeyPath).toBe('Required');
  });

  test('blocks SSH password auth unless the keychain is enabled', () => {
    const values = {
      ...defaultConnectionForm(),
      password: 'secret',
      sshEnabled: true,
      sshHost: 'bastion',
      sshUser: 'jump',
      sshAuth: 'password' as const,
      sshPassword: 'ssh-secret',
    };
    expect(
      connectionFormErrors(values, {
        passwordRequired: true,
        keychainEnabled: false,
      }).sshPassword,
    ).toContain('keychain');
    expect(
      connectionFormErrors(values, {
        passwordRequired: true,
        keychainEnabled: true,
      }).sshPassword,
    ).toBeUndefined();
  });

  test('names the platform secret store when SSH password auth is blocked', () => {
    const values = {
      ...defaultConnectionForm(),
      password: 'secret',
      sshEnabled: true,
      sshHost: 'bastion',
      sshUser: 'jump',
      sshAuth: 'password' as const,
      sshPassword: 'ssh-secret',
    };
    const message = (platform: 'macos' | 'windows') =>
      connectionFormErrors(values, { passwordRequired: true, keychainEnabled: false, platform }).sshPassword;
    expect(message('macos')).toBe('Enable the system keychain to use SSH password authentication');
    expect(message('windows')).toBe('Enable the Windows Credential Manager to use SSH password authentication');
  });

  test('requires an SSH password on create when using password auth', () => {
    const values = {
      ...defaultConnectionForm(),
      password: 'secret',
      sshEnabled: true,
      sshHost: 'bastion',
      sshUser: 'jump',
      sshAuth: 'password' as const,
      sshPassword: '',
    };
    expect(
      connectionFormErrors(values, {
        passwordRequired: true,
        keychainEnabled: true,
      }).sshPassword,
    ).toBe('Required');
    expect(
      connectionFormErrors(values, {
        passwordRequired: false,
        keychainEnabled: true,
      }).sshPassword,
    ).toBeUndefined();
  });
});

describe('firstTabWithErrors', () => {
  test('points at the SSH/SSL tab when only tunnel fields are invalid', () => {
    const errors = connectionFormErrors(
      {
        ...defaultConnectionForm(),
        password: 'secret',
        sshEnabled: true,
        sshHost: '',
        sshUser: '',
        sshAuth: 'password',
      },
      { passwordRequired: true, keychainEnabled: true },
    );
    expect(firstTabWithErrors(errors)).toBe('security');
  });

  test('points at the connection tab for general field errors', () => {
    const errors = connectionFormErrors(defaultConnectionForm(), {
      passwordRequired: true,
      keychainEnabled: false,
    });
    expect(firstTabWithErrors(errors)).toBe('connection');
  });
});

describe('connectionFormToInput', () => {
  test('trims text fields and omits id for new connections', () => {
    const input = connectionFormToInput({
      ...defaultConnectionForm(),
      name: '  Local  ',
      host: ' 127.0.0.1 ',
      databaseName: ' postgres ',
      username: ' postgres ',
      password: 'secret',
    });
    expect(input.id).toBeUndefined();
    expect(input.name).toBe('Local');
    expect(input.host).toBe('127.0.0.1');
    expect(input.database).toBe('postgres');
    expect(input.user).toBe('postgres');
    expect(input.dialect).toBe('PostgreSQL');
    expect(input.folderId).toBeNull();
    expect(input.sslMode).toBe('disabled');
    expect(input.sshEnabled).toBe(false);
  });

  test('includes the profile id when updating', () => {
    const input = connectionFormToInput(connectionFormFromProfile(profile()), 'conn_1');
    expect(input.id).toBe('conn_1');
    expect(input.host).toBe('db.example.com');
    expect(input.password).toBe('');
    expect(input.sslMode).toBe('require');
  });

  test('passes through a selected folder id and SSH fields', () => {
    const input = connectionFormToInput({
      ...defaultConnectionForm(),
      folderId: 'folder_1',
      sshEnabled: true,
      sshHost: ' bastion ',
      sshPort: 2222,
      sshUser: ' jump ',
      sshAuth: 'privateKey',
      sshKeyPath: ' /tmp/id_rsa ',
      sshPassword: 'ssh-pass',
      sshPassphrase: 'phrase',
    });
    expect(input.folderId).toBe('folder_1');
    expect(input.sshEnabled).toBe(true);
    expect(input.sshHost).toBe('bastion');
    expect(input.sshUser).toBe('jump');
    expect(input.sshAuth).toBe('privateKey');
    expect(input.sshKeyPath).toBe('/tmp/id_rsa');
    expect(input.sshPassword).toBe('ssh-pass');
    expect(input.sshPassphrase).toBe('phrase');
  });
});

describe('connectionModalCopy', () => {
  test('uses create vs update language', () => {
    expect(connectionModalCopy(false).title).toContain('New');
    expect(connectionModalCopy(false).submit).toBe('Connect Database');
    expect(connectionModalCopy(true).title).toContain('Update');
    expect(connectionModalCopy(true).submit).toBe('Save Changes');
    expect(connectionModalCopy(true).passwordHint).toContain('keep the current password');
  });
});

describe('shouldConnectAfterSave', () => {
  test('connects new profiles and leaves updates on the picker', () => {
    expect(shouldConnectAfterSave({})).toBe(true);
    expect(shouldConnectAfterSave({ id: 'conn_1' })).toBe(false);
  });
});

describe('MongoDB connection form', () => {
  const mongo = engineMeta('MongoDB')!;
  const postgres = engineMeta('PostgreSQL')!;

  test('port hidden for srv', () => {
    const form = { ...defaultConnectionForm(), params: { srv: 'true' } };
    expect(visibleConnectionFields(mongo, form)).not.toContain('port');
    expect(visibleConnectionFields(mongo, { params: {} })).toContain('port');
  });

  test('relational engines always show every base field', () => {
    expect(visibleConnectionFields(postgres, { params: { srv: 'true' } })).toEqual([
      'host',
      'port',
      'databaseName',
      'username',
      'password',
    ]);
  });

  test('relational form unchanged', () => {
    expect(defaultConnectionForm()).toEqual({
      dialect: 'PostgreSQL',
      name: 'Local PostgreSQL',
      host: '127.0.0.1',
      port: 5432,
      databaseName: 'postgres',
      username: 'postgres',
      password: '',
      sslMode: 'disabled',
      poolSize: 8,
      environment: 'development',
      folderId: '',
      sshEnabled: false,
      sshHost: '',
      sshPort: 22,
      sshUser: '',
      sshAuth: 'password',
      sshPassword: '',
      sshKeyPath: '',
      sshPassphrase: '',
      params: {},
    });
    expect(connectionFormToInput(defaultConnectionForm()).params).toBeUndefined();
  });

  test('sends only non-default allowlisted params', () => {
    expect(
      paramsForInput(mongo, {
        srv: 'true',
        directConnection: 'false',
        authSource: '',
        replicaSet: 'rs0',
        bogus: 'x',
      }),
    ).toEqual({ srv: 'true', replicaSet: 'rs0' });
    expect(paramsForInput(postgres, { srv: 'true' })).toEqual({});
  });

  test('switching to MongoDB applies its defaults and clears stale params', () => {
    const next = applyDialectDefaults(
      { ...defaultConnectionForm(), params: { x: '1' } },
      'MongoDB',
    );
    expect(next.port).toBe(27017);
    expect(next.name).toBe('Local MongoDB');
    expect(next.params).toEqual({});
  });

  test('the database may stay blank', () => {
    const form = { ...defaultConnectionForm(), dialect: 'MongoDB' as const, databaseName: '' };
    expect(
      connectionFormErrors(form, { passwordRequired: false, keychainEnabled: false }).databaseName,
    ).toBeUndefined();
  });

  test('username and password are optional for a document engine only', () => {
    const options = { passwordRequired: true, keychainEnabled: false };
    const mongoForm = { ...defaultConnectionForm(), dialect: 'MongoDB' as const, username: '', databaseName: '' };
    const mongoErrors = connectionFormErrors(mongoForm, options);
    expect(mongoErrors.username).toBeUndefined();
    expect(mongoErrors.password).toBeUndefined();
    const pgErrors = connectionFormErrors({ ...defaultConnectionForm(), username: '' }, options);
    expect(pgErrors.username).toBe('Required');
    expect(pgErrors.password).toBe('Required');
    expect(credentialsRequired('MongoDB')).toBe(false);
    expect(credentialsRequired('PostgreSQL')).toBe(true);
  });

  test('copies profile params into the form', () => {
    const form = connectionFormFromProfile(
      profile({ dialect: 'MongoDB', params: { srv: 'true' } }),
    );
    expect(form.params).toEqual({ srv: 'true' });
  });
});
