import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { promisify } from 'node:util';
import { FinanceError } from './cli.js';
import { writeExclusive } from './workbench-files.js';

const retryMs = 30;
const waitMs = 5_000;
const localPipe = process.platform === 'win32' || process.platform === 'linux';
const runFile = promisify(execFile);

function busy() {
  return new FinanceError('FINANCE_WORKBENCH_BUSY', '正在保存或迁移其他看板，请稍后重试。');
}

function listen(path) {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen({ path, exclusive: true }, () => resolve(server.unref()));
  });
}

async function pipeLock(config, signal, run) {
  const key = 'hithink-finance-workbench-' + createHash('sha256').update(config).digest('hex');
  const path = (process.platform === 'win32' ? '\\\\.\\pipe\\' : '\0') + key;
  const until = performance.now() + waitMs;
  let server;
  while (!server) {
    signal?.throwIfAborted();
    try {
      server = await listen(path);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (performance.now() >= until) throw busy();
      await wait(retryMs, undefined, { signal });
    }
  }
  // The kernel releases the pipe or abstract socket even if its owner exits unexpectedly.
  try {
    signal?.throwIfAborted();
    return await run();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function processIdentity(pid) {
  try {
    const { stdout } = await runFile('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
      env: { ...process.env, LC_ALL: 'C' }, timeout: 1_000,
    });
    const start = stdout.trim();
    if (start) return createHash('sha256').update(start).digest('hex');
  } catch {}
  return undefined;
}

let writerIdentity;

async function abandoned(pid, recordedIdentity) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error.code === 'ESRCH';
  }
  if (!recordedIdentity) return false;
  const currentIdentity = pid === process.pid ? await writerIdentity : await processIdentity(pid);
  return currentIdentity !== undefined && currentIdentity !== recordedIdentity;
}

async function release(directory, owner) {
  if (owner) await rm(join(directory, owner), { force: true }).catch(() => {});
  await rmdir(directory).catch(() => {});
}

function transient(error) {
  return ['ENOENT', 'EACCES', 'EPERM', 'EBUSY'].includes(error.code);
}

async function directoryLock(config, signal, run) {
  writerIdentity ??= processIdentity(process.pid);
  const identity = await writerIdentity;
  if (!identity) throw new Error('Failed to identify the dashboard writer process');
  const lock = join(config, 'writer.lock');
  const staging = await mkdtemp(join(config, '.writer-'));
  const owner = `${process.pid}-${identity}-${randomUUID()}`;
  let active = false;
  let nextOwnerCheck = 0;
  try {
    await writeExclusive(join(staging, owner), '', signal);
    const until = performance.now() + waitMs;
    while (!active) {
      signal?.throwIfAborted();
      try {
        await rename(staging, lock);
        active = true;
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) && !transient(error)) throw error;
        const canonical = await realpath(lock).catch((failure) => {
          if (!transient(failure)) throw failure;
          return null;
        });
        if (canonical && canonical !== lock) throw new Error('Invalid dashboard writer lock');
        const entries = canonical && await readdir(lock).catch((failure) => {
          if (!transient(failure)) throw failure;
          return null;
        });
        if (entries?.length === 0) await release(lock);
        if (entries?.length === 1 && performance.now() >= nextOwnerCheck) {
          nextOwnerCheck = performance.now() + 250;
          const match = /^([1-9]\d*)-(?:([a-f0-9]{64})-)?[a-f0-9-]{36}$/.exec(entries[0]);
          if (match && await abandoned(Number(match[1]), match[2])) await release(lock, entries[0]);
        }
        if (performance.now() >= until) throw busy();
        await wait(retryMs, undefined, { signal });
      }
    }
    signal?.throwIfAborted();
    return await run();
  } finally {
    await release(active ? lock : staging, owner);
  }
}

export function writeLocked(config, signal, run) {
  return localPipe ? pipeLock(config, signal, run) : directoryLock(config, signal, run);
}
