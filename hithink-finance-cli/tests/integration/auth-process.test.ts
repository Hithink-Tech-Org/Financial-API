import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';

test('OS lock serializes real processes and is released after owner termination', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-process-'));
  const ns = 'hithink-finance-test-' + randomUUID();
  const args = (command: string) => ['tests/fixtures/auth-process.mjs', command, home, ns];
  const options = { env: { ...process.env, NODE_OPTIONS: '' }, timeout: 30000 };
  const holder = spawn(process.execPath, args('hold'), {
    ...options,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      holder.once('error', reject);
      holder.stdout.once('data', () => resolve());
      holder.once('exit', () => reject(Error('holder exited before locking')));
    });
    const inode = (await stat(authPaths(() => home).lock)).ino;
    let committed = false;
    const waiter = execa(process.execPath, args('increment'), options).then(() => {
      committed = true;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(committed).toBe(false);
    holder.kill();
    await waiter;
    await Promise.all([
      execa(process.execPath, args('increment'), options),
      execa(process.execPath, args('increment'), options),
    ]);
    const keyring = {
      async get() {
        throw Error();
      },
      async set() {},
      async delete() {
        return false;
      },
      async listAccounts() {
        return [];
      },
    };
    const store = new GlobalCredentialStore(
      authPaths(() => home),
      keyring,
    );
    expect((await store.read())!.selection_epoch).toBe(3);
    expect((await stat(store.paths.lock)).ino).toBe(inode);
  } finally {
    holder.kill();
    await rm(home, { recursive: true, force: true });
  }
}, 60000);

test('private credential files survive independent processes and store large tokens', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-file-'));
  const ns = 'hithink-finance-test-' + randomUUID();
  const run = (command: string) =>
    execa(process.execPath, ['tests/fixtures/auth-process.mjs', command, home, ns], {
      env: { ...process.env, NODE_OPTIONS: '' },
      timeout: 30000,
    });
  try {
    await run('file-write');
    expect(JSON.parse((await run('file-read')).stdout)).toEqual({ recovered: true });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}, 60000);
