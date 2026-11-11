import os from 'node:os';
import path from 'node:path';
import { CliError } from '../../contracts/errors.js';

export function authError(code: string, message: string, storage = false): CliError {
  return new CliError({
    code,
    message,
    category: storage ? 'local-data' : 'authentication',
    hint: storage
      ? code === 'AUTH_MIGRATION_REQUIRED'
        ? 'Run `hithink-finance auth migrate`, then retry the command.'
        : 'Check credential file permissions and run `hithink-finance doctor`.'
      : 'Run `hithink-finance auth status`, then log in or select an available method.',
    retryable: false,
    exitCode: storage ? 5 : 3,
  });
}

export function assertAuthRuntime(version = process.versions.node): void {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  if (!(major >= 24 || (major === 22 && minor >= 13)))
    throw authError('AUTH_RUNTIME_UNSUPPORTED', 'Node.js ^22.13.0 or >=24.0.0 is required.');
}

export interface AuthPaths {
  environment: 'production' | 'test';
  root: string;
  document: string;
  lock: string;
}
export function authPaths(
  home: () => string = () => os.userInfo().homedir,
  environment: 'production' | 'test' = 'production',
): AuthPaths {
  let directory: string;
  try {
    directory = home();
    if (!path.isAbsolute(directory)) throw Error();
  } catch {
    throw authError(
      'AUTH_HOME_UNAVAILABLE',
      'Cannot determine the operating system user home.',
      true,
    );
  }
  const root = path.join(directory, '.hithink-finance', 'auth', environment);
  return {
    environment,
    root,
    document: path.join(root, 'auth.json'),
    lock: path.join(root, 'auth-lock.sqlite'),
  };
}
