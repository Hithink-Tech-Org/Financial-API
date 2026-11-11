import { randomBytes } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { withAuthLock } from '../../infrastructure/credentials/auth-state-lock.js';
import { writeAuthAtomic, fileCode } from '../../infrastructure/credentials/auth-files.js';
import { cancelledError } from '../../contracts/errors.js';
import {
  authenticateServer,
  frames,
  next,
  outputChannel,
  send,
  workerError,
  type Frame,
} from './protocol.js';
import {
  buildId,
  endpoint,
  identity,
  readRecord,
  requestEnvironment,
  type WorkerIdentity,
  type WorkerRecord,
} from './paths.js';
import { connectWorker, eligible } from './client.js';
import type { CommandRuntime } from '../run.js';

interface RunRequest {
  id: string;
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  tty: { stdout: boolean; stderr: boolean; columns: number };
  deadline: number;
}
function request(frame: Frame): RunRequest {
  if (
    frame.t !== 'run' ||
    typeof frame.id !== 'string' ||
    frame.id.length > 100 ||
    !Array.isArray(frame.argv) ||
    frame.argv.length > 128 ||
    frame.argv.some((arg) => typeof arg !== 'string') ||
    Buffer.byteLength(JSON.stringify(frame.argv)) > 64 * 1024 ||
    typeof frame.cwd !== 'string' ||
    typeof frame.stdin !== 'string' ||
    Buffer.byteLength(frame.stdin) > 1024 * 1024 ||
    !frame.env ||
    typeof frame.env !== 'object' ||
    Array.isArray(frame.env) ||
    Object.values(frame.env).some((value) => typeof value !== 'string') ||
    Buffer.byteLength(JSON.stringify(frame.env)) > 128 * 1024 ||
    !frame.tty ||
    typeof frame.tty !== 'object' ||
    typeof frame.deadline !== 'number' ||
    !Number.isFinite(frame.deadline)
  )
    throw Error('Invalid worker request.');
  const tty = frame.tty as Record<string, unknown>;
  if (!path.isAbsolute(frame.cwd)) throw Error('Worker working directory must be absolute.');
  if (
    typeof tty.stdout !== 'boolean' ||
    typeof tty.stderr !== 'boolean' ||
    !Number.isInteger(tty.columns) ||
    Number(tty.columns) < 4 ||
    Number(tty.columns) > 10000
  )
    throw Error('Invalid worker terminal.');
  if (frame.argv.includes('--api-key-stdin') && Buffer.byteLength(frame.stdin) > 16 * 1024)
    throw Error('Worker input exceeds the key limit.');
  return {
    id: frame.id,
    argv: frame.argv as string[],
    cwd: frame.cwd,
    stdin: frame.stdin,
    env: requestEnvironment(frame.env as NodeJS.ProcessEnv, frame.cwd),
    tty: { stdout: tty.stdout, stderr: tty.stderr, columns: Number(tty.columns) },
    deadline: frame.deadline,
  };
}
export interface WorkerOptions {
  idleMs?: number;
  taskMs?: number;
  cancelMs?: number;
}
export async function startWorker(
  paths: WorkerIdentity,
  options: WorkerOptions = {},
): Promise<void> {
  let owner: WorkerRecord | undefined;
  await withAuthLock(paths, async () => {
    const old = await readRecord(paths);
    if (old?.phase === 'starting' && old.until > Date.now() && old.until <= Date.now() + 10000)
      return;
    if (old?.phase === 'ready') {
      try {
        const connection = await connectWorker(paths, old, 750);
        connection.socket.destroy();
        return;
      } catch {
        /* An unresponsive generation is retired under this transaction, never killed by PID. */
      }
    }
    if (process.platform !== 'win32' && old) {
      const socketPath = endpoint(paths, old.instance);
      try {
        const info = await lstat(socketPath);
        if (!info.isSocket() || info.uid !== process.getuid?.())
          throw Error('Unsafe worker socket.');
        await rm(socketPath);
      } catch (error) {
        if (fileCode(error) !== 'ENOENT') throw error;
      }
    }
    owner = {
      pid: process.pid,
      instance: randomBytes(16).toString('hex'),
      secret: randomBytes(32).toString('hex'),
      phase: 'starting',
      until: Date.now() + 10000,
    };
    await writeAuthAtomic(paths.document, owner);
  });
  if (!owner) return;
  const record = owner;
  const currentOwner = async () => (await readRecord(paths))?.instance === record.instance;
  const sockets = new Set<Socket>(),
    controllers = new Set<AbortController>();
  const server = createServer();
  server.maxConnections = 16;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let watcher: ReturnType<typeof setInterval> | undefined;
  let pending = 0,
    active = false,
    draining = false;
  let queue = Promise.resolve();
  const close = () => {
    draining = true;
    clearTimeout(idle);
    if (!pending && server.listening) server.close();
  };
  const armIdle = () => {
    clearTimeout(idle);
    if (!pending && !draining) idle = setTimeout(close, options.idleMs ?? 120000);
    if (!pending && draining) close();
  };
  const terminate = () => {
    draining = true;
    clearTimeout(idle);
    for (const controller of controllers) controller.abort('SIGTERM');
    for (const socket of sockets) socket.destroy();
    if (server.listening) server.close();
  };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  process.once('SIGHUP', terminate);
  try {
    const runtime = await import('../run.js');
    const { remoteCapabilities } = await import('../../contracts/remote-capabilities.js');
    const routes = remoteCapabilities.map((item) => [...item.command]);
    if (!(await currentOwner()) || (await buildId(paths.packageRoot)) !== paths.build) return;
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('error', () => undefined);
      const controller = new AbortController();
      socket.once('close', () => {
        sockets.delete(socket);
        controller.abort('CLIENT_DISCONNECTED');
      });
      const handshake = setTimeout(() => socket.destroy(), 3000);
      void (async () => {
        const reader = frames(socket);
        await authenticateServer(socket, reader, record.secret, record.instance);
        const frame = await next(reader);
        clearTimeout(handshake);
        if (frame.t === 'status' || frame.t === 'stop') {
          if (frame.t === 'stop') close();
          await send(socket, {
            t: 'status',
            state: draining ? 'stopping' : 'running',
            running: true,
            pid: process.pid,
            active,
            queued: pending - Number(active),
            idle_ms: options.idleMs ?? 120000,
          });
          await new Promise<void>((resolve) => socket.end(resolve));
          return;
        }
        const job = request(frame);
        if (
          !eligible(job.argv, routes) ||
          frame.build !== paths.build ||
          !(await currentOwner()) ||
          (await identity(paths.packageRoot, job.env, job.cwd))?.id !== paths.id
        )
          throw Error('Worker request does not match this instance.');
        const output = outputChannel(socket, 'stdout', job.id),
          error = outputChannel(socket, 'stderr', job.id);
        Object.assign(output.stream, { isTTY: job.tty.stdout, columns: job.tty.columns });
        Object.assign(error.stream, { isTTY: job.tty.stderr });
        const context: CommandRuntime = {
          cwd: job.cwd,
          env: job.env,
          stdin: Readable.from([job.stdin]),
          stdout: output.stream,
          stderr: error.stream,
          signal: controller.signal,
        };
        const complete = async (code: number) => {
          await Promise.all([output.finish(), error.finish()]);
          await send(socket, { t: 'done', id: job.id, code });
          await new Promise<void>((resolve) => socket.end(resolve));
        };
        if (draining || pending >= 8) {
          await complete(
            await runtime.renderFailure(
              job.argv,
              workerError('WORKER_BUSY', 'The worker is stopping or its bounded queue is full.'),
              context,
            ),
          );
          return;
        }
        pending++;
        controllers.add(controller);
        clearTimeout(idle);
        try {
          await send(socket, { t: 'accepted', id: job.id });
        } catch (failure) {
          pending--;
          controllers.delete(controller);
          armIdle();
          throw failure;
        }
        let executing = false;
        let hard: ReturnType<typeof setTimeout> | undefined;
        const enforce = () => {
          if (executing && !hard)
            hard = setTimeout(() => process.exit(5), options.cancelMs ?? 2000);
        };
        controller.signal.addEventListener('abort', enforce, { once: true });
        const budget = Math.max(0, Math.min(options.taskMs ?? 120000, job.deadline - Date.now()));
        const deadline = setTimeout(() => controller.abort('DEADLINE'), budget);
        const operation = queue
          .catch(() => undefined)
          .then(async () => {
            executing = true;
            try {
              const code =
                controller.signal.aborted || Date.now() >= job.deadline
                  ? await runtime.renderFailure(job.argv, cancelledError(), context)
                  : await runtime.executeCommand(job.argv, context);
              await complete(code);
            } finally {
              executing = false;
            }
          });
        queue = operation.then(
          () => undefined,
          () => undefined,
        );
        try {
          active = true;
          await operation;
        } finally {
          clearTimeout(deadline);
          clearTimeout(hard);
          controller.signal.removeEventListener('abort', enforce);
          controllers.delete(controller);
          pending--;
          active = pending > 0;
          armIdle();
        }
      })()
        .catch(() => socket.destroy())
        .finally(() => {
          clearTimeout(handshake);
          socket.destroy();
        });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint(paths, record.instance), resolve);
    });
    const closed = new Promise<void>((resolve) => server.once('close', resolve));
    await withAuthLock(paths, async () => {
      if (!(await currentOwner()) || (await buildId(paths.packageRoot)) !== paths.build) {
        close();
        return;
      }
      await writeAuthAtomic(paths.document, { ...record, phase: 'ready' });
    });
    watcher = setInterval(() => {
      void currentOwner().then((owned) => {
        if (!owned) terminate();
      }, terminate);
    }, 1000);
    armIdle();
    await closed;
  } finally {
    clearTimeout(idle);
    clearInterval(watcher);
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await withAuthLock(paths, async () => {
      if (await currentOwner()) await rm(paths.document, { force: true });
    });
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', terminate);
    process.removeListener('SIGHUP', terminate);
  }
}
