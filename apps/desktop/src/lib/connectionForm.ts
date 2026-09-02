import type {
  ConnectionProfile,
  Environment,
  SaveConnectionInput,
  SshAuthMethod,
  SslMode,
} from '../types';
import { defaultSslForHost } from './connectionSecurity';

export type ConnectionModalTab = 'connection' | 'security';

export type ConnectionFormField =
  | 'name'
  | 'host'
  | 'port'
  | 'databaseName'
  | 'username'
  | 'password'
  | 'poolSize'
  | 'sshHost'
  | 'sshPort'
  | 'sshUser'
  | 'sshPassword'
  | 'sshKeyPath'
  | 'sshPassphrase';

export type ConnectionFormValues = {
  name: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslMode: SslMode;
  poolSize: number;
  environment: Environment;
  folderId: string;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuth: SshAuthMethod;
  sshPassword: string;
  sshKeyPath: string;
  sshPassphrase: string;
};

export type ConnectionFormErrorOptions = {
  passwordRequired: boolean;
  keychainEnabled: boolean;
};

const CONNECTION_TAB_FIELDS: ConnectionFormField[] = [
  'name',
  'host',
  'port',
  'databaseName',
  'username',
  'password',
  'poolSize',
];

export function defaultConnectionForm(): ConnectionFormValues {
  const host = '127.0.0.1';
  return {
    name: 'Local PostgreSQL',
    host,
    port: 5432,
    databaseName: 'postgres',
    username: 'postgres',
    password: '',
    sslMode: defaultSslForHost(host),
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
  };
}

export function connectionFormFromProfile(
  profile: ConnectionProfile
): ConnectionFormValues {
  return {
    name: profile.name,
    host: profile.host,
    port: profile.port,
    databaseName: profile.database,
    username: profile.user,
    password: '',
    sslMode: profile.sslMode,
    poolSize: profile.poolSize,
    environment: profile.environment,
    folderId: profile.folderId ?? '',
    sshEnabled: profile.sshEnabled,
    sshHost: profile.sshHost,
    sshPort: profile.sshPort,
    sshUser: profile.sshUser,
    sshAuth: profile.sshAuth,
    sshPassword: '',
    sshKeyPath: profile.sshKeyPath ?? '',
    sshPassphrase: '',
  };
}

export function connectionFormErrors(
  values: ConnectionFormValues,
  options: ConnectionFormErrorOptions
): Partial<Record<ConnectionFormField, string>> {
  const next: Partial<Record<ConnectionFormField, string>> = {};
  if (!values.name.trim()) next.name = 'Required';
  if (!values.host.trim()) next.host = 'Required';
  if (!Number.isFinite(values.port) || values.port < 1 || values.port > 65535) {
    next.port = 'Enter a port from 1 to 65535';
  }
  if (!values.databaseName.trim()) next.databaseName = 'Required';
  if (!values.username.trim()) next.username = 'Required';
  if (options.passwordRequired && !values.password) next.password = 'Required';
  if (!Number.isFinite(values.poolSize) || values.poolSize < 1 || values.poolSize > 32) {
    next.poolSize = 'Enter a pool size from 1 to 32';
  }
  if (values.sshEnabled) {
    if (!values.sshHost.trim()) next.sshHost = 'Required';
    if (!Number.isFinite(values.sshPort) || values.sshPort < 1 || values.sshPort > 65535) {
      next.sshPort = 'Enter a port from 1 to 65535';
    }
    if (!values.sshUser.trim()) next.sshUser = 'Required';
    if (values.sshAuth === 'password') {
      if (!options.keychainEnabled) {
        next.sshPassword = 'Enable the system keychain to use SSH password authentication';
      } else if (options.passwordRequired && !values.sshPassword) {
        next.sshPassword = 'Required';
      }
    } else if (!values.sshKeyPath.trim()) {
      next.sshKeyPath = 'Required';
    }
  }
  return next;
}

export function firstTabWithErrors(
  errors: Partial<Record<ConnectionFormField, string>>
): ConnectionModalTab | null {
  const fields = Object.keys(errors) as ConnectionFormField[];
  if (fields.length === 0) return null;
  return fields.some((field) => CONNECTION_TAB_FIELDS.includes(field))
    ? 'connection'
    : 'security';
}

export function connectionFormToInput(
  values: ConnectionFormValues,
  id?: string
): SaveConnectionInput {
  return {
    ...(id ? { id } : {}),
    name: values.name.trim(),
    dialect: 'PostgreSQL',
    host: values.host.trim(),
    port: values.port,
    database: values.databaseName.trim(),
    user: values.username.trim(),
    password: values.password,
    sslMode: values.sslMode,
    poolSize: values.poolSize,
    environment: values.environment,
    folderId: values.folderId.trim() ? values.folderId : null,
    sshEnabled: values.sshEnabled,
    sshHost: values.sshHost.trim(),
    sshPort: Number.isFinite(values.sshPort) ? values.sshPort : 22,
    sshUser: values.sshUser.trim(),
    sshAuth: values.sshAuth,
    sshKeyPath: values.sshKeyPath.trim() ? values.sshKeyPath.trim() : null,
    sshPassword: values.sshPassword,
    sshPassphrase: values.sshPassphrase,
  };
}

export function connectionModalCopy(isEdit: boolean) {
  return isEdit
    ? {
        title: 'Update Database Connection Profile',
        submit: 'Save Changes',
        submitting: 'Saving...',
        passwordHint: 'Leave blank to keep the current password',
      }
    : {
        title: 'New Database Connection Profile',
        submit: 'Connect Database',
        submitting: 'Connecting...',
        passwordHint: undefined as string | undefined,
      };
}

export function shouldConnectAfterSave(input: { id?: string }): boolean {
  return !input.id;
}
