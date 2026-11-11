import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { optionValue } from '../context.js';
import { readStdin } from '../../infrastructure/filesystem/stdin.js';
import { createProcessShutdown, shutdownExitCode } from '../../infrastructure/process/shutdown.js';
import { cancelledError } from '../../contracts/errors.js';
import { authenticateClient, frames, next, send, workerError, type Frame } from './protocol.js';
import {
  buildId,
  endpoint,
  identity,
  readRecord,
  requestEnvironment,
  workerEnvironment,
  type WorkerIdentity,
  type WorkerRecord,
} from './paths.js';

function route(argv: readonly string[]): string[] {
  const values = new Set([
    '--format',
    '--lang',
    '--profile',
    '--config',
    '--api-key',
    '--db',
    '--request-id',
    '--source',
    '--max-rows',
    '--columns',
  ]);
  const result: string[] = [];
  for (let index = 0; index < argv.length && result.length < 2; index++) {
    const arg = argv[index]!;
    if (arg === '--') break;
    if (values.has(arg)) {
      index++;
      continue;
    }
    if (!arg.startsWith('-')) result.push(arg);
  }
  return result;
}
export function eligible(argv: readonly string[], routes: readonly string[][]): boolean {
  if (
    argv.some((arg) => ['--help', '-h', '--api-key'].includes(arg) || arg.startsWith('--api-key='))
  )
    return false;
  if (argv.includes('--codes-stdin') && argv.includes('--api-key-stdin')) return false;
  const command = route(argv);
  if (!routes.some((route) => route[0] === command[0] && route[1] === command[1])) return false;
  return (
    command[0] !== 'market' ||
    command[1] !== 'history' ||
    optionValue(argv, '--source') === 'remote'
  );
}
export async function connectWorker(
  paths: WorkerIdentity,
  record: WorkerRecord,
  timeout = 2500,
): Promise<{ socket: Socket; reader: AsyncGenerator<Frame> }> {
  const socket = createConnection(endpoint(paths, record.instance));
  socket.on('error', () => undefined);
  const timer = setTimeout(() => socket.destroy(Error('Worker handshake timed out.')), timeout);
  try {
    await once(socket, 'connect');
    const reader = frames(socket);
    await authenticateClient(socket, reader, record.secret, record.instance);
    return { socket, reader };
  } catch (error) {
    socket.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function findOrStart(
  paths: WorkerIdentity,
): Promise<Awaited<ReturnType<typeof connectWorker>> | undefined> {
  const record = await readRecord(paths);
  if (record?.phase === 'ready') {
    try {
      return await connectWorker(paths, record, 1000);
    } catch {
      /* Startup arbitrates stale instances. */
    }
  }
  const child = spawn(
    process.execPath,
    [...process.execArgv, fileURLToPath(new URL('./entry.js', import.meta.url)), paths.id],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: workerEnvironment(process.env),
    },
  );
  let failed = false;
  child.on('error', () => {
    failed = true;
  });
  child.on('exit', (code) => {
    if (code !== 0) failed = true;
  });
  child.unref();
  const deadline = Date.now() + 7000;
  while (!failed && Date.now() < deadline) {
    await delay(40);
    const current = await readRecord(paths);
    if (current?.phase === 'ready') {
      try {
        return await connectWorker(
          paths,
          current,
          Math.min(1000, Math.max(1, deadline - Date.now())),
        );
      } catch {
        /* Wait for the owner to become ready. */
      }
    }
  }
  return undefined;
}
export async function tryWorker(
  argv: readonly string[],
): Promise<{ code: number } | { input?: string } | undefined> {
  if (
    process.env.HITHINK_FINANCE_NO_WORKER === '1' ||
    process.execArgv.some(
      (arg) =>
        arg.startsWith('--inspect') ||
        ['-e', '--eval', '--input-type'].some((flag) => arg === flag || arg.startsWith(flag + '=')),
    )
  )
    return undefined;
  const packageRoot = path.resolve(import.meta.dirname, '../../..');
  let routes: string[][];
  try {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'schemas/capabilities.json'), 'utf8'),
    ) as { capabilities: { source: string; command: string[] }[] };
    routes = manifest.capabilities
      .filter((item) => item.source === 'remote')
      .map((item) => item.command);
  } catch {
    return undefined;
  }
  if (!eligible(argv, routes)) return undefined;
  const paths = await identity(packageRoot);
  if (!paths) return undefined;
  const shutdown = createProcessShutdown();
  const transport = new AbortController();
  const outputSignal = AbortSignal.any([shutdown.signal, transport.signal]);
  let connection: Awaited<ReturnType<typeof connectWorker>> | undefined;
  let input: string | undefined;
  let sent = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = () => connection?.socket.destroy();
  shutdown.signal.addEventListener('abort', abort, { once: true });
  try {
    if (argv.includes('--api-key-stdin') || argv.includes('--codes-stdin'))
      input = await readStdin(process.stdin, {
        signal: shutdown.signal,
        maxBytes: argv.includes('--api-key-stdin') ? 16 * 1024 : 1024 * 1024,
      });
    connection = await findOrStart(paths);
    if (shutdown.signal.aborted) throw cancelledError();
    if (!connection) {
      if ((await buildId(packageRoot)) !== paths.build)
        throw workerError(
          'CLI_BUILD_NOT_READY',
          'The CLI build changed before dispatch. Retry after the build completes.',
        );
      return input === undefined ? {} : { input };
    }
    const { socket, reader } = connection;
    socket.once('error', () => transport.abort());
    const id = randomUUID();
    const request = {
      t: 'run',
      id,
      build: paths.build,
      argv,
      cwd: process.cwd(),
      env: requestEnvironment(process.env),
      stdin: input ?? '',
      tty: {
        stdout: process.stdout.isTTY === true,
        stderr: process.stderr.isTTY === true,
        columns: process.stdout.columns ?? 80,
      },
      deadline: Date.now() + 120000,
    };
    // No foreground replay after this boundary, even if acknowledgement is lost.
    sent = true;
    timeout = setTimeout(() => {
      transport.abort();
      socket.destroy();
    }, 135000);
    await send(socket, request);
    for await (const frame of reader) {
      if (frame.id !== id) throw Error('Worker request identity mismatch.');
      if (frame.t === 'accepted') continue;
      if (
        frame.t === 'done' &&
        Number.isInteger(frame.code) &&
        Number(frame.code) >= 0 &&
        Number(frame.code) <= 255
      )
        return { code: Number(frame.code) };
      if (
        frame.t !== 'output' ||
        !['stdout', 'stderr'].includes(String(frame.channel)) ||
        typeof frame.data !== 'string' ||
        frame.data.length > 64 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/u.test(frame.data)
      )
        throw Error('Invalid worker result.');
      const stream = frame.channel === 'stdout' ? process.stdout : process.stderr;
      if (!stream.write(Buffer.from(frame.data, 'base64')))
        await once(stream, 'drain', { signal: outputSignal });
    }
    throw Error('Worker result ended without completion.');
  } catch (error) {
    if (shutdown.signal.aborted) {
      const { renderFailure } = await import('../run.js');
      await renderFailure(argv, cancelledError(), { signal: shutdown.signal });
      return { code: shutdownExitCode(shutdown.signal.reason) ?? 130 };
    }
    if (sent) {
      if (process.stdout.writableNeedDrain) process.stdout.destroy();
      throw workerError(
        'WORKER_RESULT_UNKNOWN',
        'The worker connection ended after submission. The request was not replayed; inspect any output file before retrying.',
      );
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['CLI_STDIN_TOO_LARGE', 'CLI_BUILD_NOT_READY'].includes(String(error.code))
    )
      throw error;
    return input === undefined ? {} : { input };
  } finally {
    clearTimeout(timeout);
    shutdown.signal.removeEventListener('abort', abort);
    shutdown.dispose();
    connection?.socket.destroy();
  }
}
export async function workerControl(
  packageRoot: string,
  operation: 'status' | 'stop',
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  const paths = await identity(packageRoot, env);
  let record: WorkerRecord | undefined;
  try {
    record = paths ? await readRecord(paths) : undefined;
  } catch {
    return { state: 'unavailable', running: null };
  }
  if (!paths || !record) return { state: 'absent', running: false };
  let connection: Awaited<ReturnType<typeof connectWorker>> | undefined;
  try {
    connection = await connectWorker(paths, record);
    await send(connection.socket, { t: operation });
    const response = await next(connection.reader);
    if (response.t !== 'status') throw Error('Invalid worker control response.');
    const { t: _type, ...status } = response;
    void _type;
    return status;
  } catch {
    return { state: record.phase === 'starting' ? 'starting' : 'unreachable', running: null };
  } finally {
    connection?.socket.destroy();
  }
}
