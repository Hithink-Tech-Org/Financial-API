import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { privatePaths } from '../../infrastructure/credentials/auth-files.js';
import { workerError } from './protocol.js';

export const KEY_ENV = ['HITHINK_FINANCE_API_KEY', 'FUYAO_TOKEN', 'API_KEY'];
const ENV_KEYS = [
  'PATH',
  'SystemRoot',
  'WINDIR',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TEMP',
  'TMP',
  'APPDATA',
  'LOCALAPPDATA',
  'HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_SYSTEM_CA',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'OPENSSL_CONF',
  'OPENSSL_MODULES',
  'NODE_USE_ENV_PROXY',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'DBUS_SESSION_BUS_ADDRESS',
  'LC_ALL',
  'LC_MESSAGES',
  'LANG',
  'NO_COLOR',
  'DEBUG',
  'HITHINK_FINANCE_FUYAO_BASE_URL',
  'HITHINK_FINANCE_CONFIG',
  'HITHINK_FINANCE_DB_PATH',
  'HITHINK_FINANCE_PROFILE',
  'HITHINK_FINANCE_NO_UPDATE_CHECK',
  'HITHINK_FINANCE_NO_SKILL_UPDATE',
  'HITHINK_TEST_USER_HOME',
];
const FILE_ENV = new Set([
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'OPENSSL_CONF',
  'OPENSSL_MODULES',
]);
export function workerEnvironment(env: NodeJS.ProcessEnv, cwd = process.cwd()): NodeJS.ProcessEnv {
  const result = Object.fromEntries(
    ENV_KEYS.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]),
  );
  for (const name of FILE_ENV) if (result[name]) result[name] = path.resolve(cwd, result[name]!);
  if (result.NODE_PATH)
    result.NODE_PATH = result.NODE_PATH.split(path.delimiter)
      .map((value) => (value ? path.resolve(cwd, value) : value))
      .join(path.delimiter);
  return result;
}
function cwdBound(env: NodeJS.ProcessEnv): boolean {
  // Custom startup loaders can read cwd even when the loader itself is absolute.
  return (
    process.execArgv.length > 0 ||
    /(?:^|\s)(?:-r|--(?:require|import|loader|experimental-loader|openssl-config|icu-data-dir|env-file|env-file-if-exists|redirect-warnings|diagnostic-dir|report-directory|cpu-prof-dir|heap-prof-dir))(?:=|\s|$)/u.test(
      env.NODE_OPTIONS ?? '',
    ) ||
    (env.PATH !== undefined &&
      env.PATH.split(path.delimiter).some(
        (value) => !path.isAbsolute(value.replace(/^"|"$/gu, '')),
      ))
  );
}
export function requestEnvironment(env: NodeJS.ProcessEnv, cwd = process.cwd()): NodeJS.ProcessEnv {
  return {
    ...workerEnvironment(env, cwd),
    ...Object.fromEntries(
      KEY_ENV.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]),
    ),
  };
}
export interface WorkerIdentity {
  id: string;
  build: string;
  packageRoot: string;
  root: string;
  document: string;
  lock: string;
  environment: 'production';
}
export interface WorkerRecord {
  pid: number;
  instance: string;
  secret: string;
  phase: 'starting' | 'ready';
  until: number;
}
export async function buildId(packageRoot: string): Promise<string | undefined> {
  let value: { phase?: string; id?: string };
  try {
    value = JSON.parse(await readFile(path.join(packageRoot, 'dist/runtime-build.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (value.phase !== 'ready' || !/^[a-f0-9]{64}$/u.test(value.id ?? ''))
    throw workerError(
      'CLI_BUILD_NOT_READY',
      'The local CLI build is incomplete. Run npm run build successfully.',
    );
  return value.id;
}
export async function identity(
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<WorkerIdentity | undefined> {
  const rootPath = await realpath(packageRoot);
  const build = await buildId(rootPath);
  if (!build) return undefined;
  const metadata = JSON.parse(await readFile(path.join(rootPath, 'package.json'), 'utf8')) as {
    version: string;
  };
  const id = createHash('sha256')
    .update(
      JSON.stringify([
        1,
        rootPath,
        metadata.version,
        build,
        process.execPath,
        process.version,
        process.execArgv.filter((arg) => !arg.startsWith('--inspect')),
        cwdBound(env) ? path.resolve(cwd) : null,
        workerEnvironment(env, cwd),
      ]),
    )
    .digest('hex')
    .slice(0, 24);
  let home: string;
  try {
    home = os.userInfo().homedir;
  } catch {
    return undefined;
  }
  const root = path.join(home, '.hithink-finance', 'cli-workers', id);
  return {
    id,
    build,
    packageRoot: rootPath,
    root,
    document: path.join(root, 'worker.json'),
    lock: path.join(root, 'worker-lock.sqlite'),
    environment: 'production',
  };
}
export function endpoint(paths: WorkerIdentity, instance: string): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\hithink-finance-${paths.id}-${instance}`;
  const socket = path.join(paths.root, `s-${instance.slice(0, 12)}`);
  if (Buffer.byteLength(socket) > 100) throw Error('Worker socket path is too long.');
  return socket;
}
export async function readRecord(paths: WorkerIdentity): Promise<WorkerRecord | undefined> {
  try {
    await lstat(paths.document);
    await privatePaths([paths.root, paths.document]);
    const record = JSON.parse(await readFile(paths.document, 'utf8')) as WorkerRecord;
    if (
      !Number.isSafeInteger(record.pid) ||
      record.pid <= 0 ||
      !/^[a-f0-9]{32}$/u.test(record.instance) ||
      !/^[a-f0-9]{64}$/u.test(record.secret) ||
      !['starting', 'ready'].includes(record.phase) ||
      !Number.isFinite(record.until)
    )
      return undefined;
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
