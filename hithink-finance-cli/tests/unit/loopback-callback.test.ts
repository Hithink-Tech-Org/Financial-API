import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { listenForCallback } from '../../src/infrastructure/credentials/loopback-callback.js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';

test.each(['success', 'denied', 'cancel'])(
  'foreground CLI remains alive until the real callback lifecycle ends: %s',
  async (mode) => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'fin-login-'));
    const adapter = new URL('../fixtures/auth-worker-service.mjs', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        'dist/cli/main.js',
        'auth',
        'login',
        '--method',
        'oauth',
        '--no-browser',
        '--format',
        'json',
      ],
      {
        env: {
          ...process.env,
          HITHINK_TEST_USER_HOME: home,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import="${adapter}"`,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 12000,
      },
    );
    const exited = new Promise((resolve) => child.once('exit', resolve));
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const read = async () => JSON.parse(await readFile(authPaths(() => home).document, 'utf8'));
    try {
      const url = await new Promise<URL>((resolve, reject) => {
        let stdout = '';
        child.once('error', reject);
        child.once('exit', () => reject(Error(`login exited before URL: ${stderr}`)));
        child.stdout.on('data', (chunk) => {
          stdout += String(chunk);
          const match = stdout.match(/https:\/\/auth\.example\.test\/\?state=[^\s]+/);
          if (match) resolve(new URL(match[0]));
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(child.exitCode).toBeNull();
      if (mode === 'cancel') child.kill('SIGTERM');
      else {
        const parameter = mode === 'success' ? 'code=fixture' : 'error=access_denied';
        const response = await fetch(
          `http://127.0.0.1:18765/oauth/callback?state=${url.searchParams.get('state')}&${parameter}`,
          { signal: AbortSignal.timeout(5000), headers: { connection: 'close' } },
        );
        expect(response.status).toBe(mode === 'success' ? 200 : 400);
      }
      await exited;
      if (mode !== 'cancel') expect(child.exitCode, stderr).toBe(mode === 'success' ? 0 : 3);
      await expect.poll(async () => (await read()).pending, { timeout: 5000 }).toBeUndefined();
      if (mode === 'success')
        expect((await read()).credentials.oauth.known_state).toBe('available');
      else expect((await read()).credentials.oauth).toBeUndefined();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  20000,
);

test.each([
  'disconnect',
  'background',
  'cancel',
  'forced-restart',
  ...(process.platform === 'win32' ? [] : ['SIGTERM', 'SIGINT']),
])(
  'real auth worker handles %s without stranding the next login',
  async (mode) => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'fin-auth-'));
    const workers: ReturnType<typeof spawn>[] = [];
    const read = async () => JSON.parse(await readFile(authPaths(() => home).document, 'utf8'));
    const start = async (background = false) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          './tests/fixtures/auth-worker-service.mjs',
          'dist/infrastructure/credentials/auth-worker.js',
        ],
        {
          env: { ...process.env, HITHINK_TEST_USER_HOME: home },
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          timeout: 10000,
        },
      );
      workers.push(child);
      const exited = new Promise((resolve) => child.once('exit', resolve));
      const ready = await new Promise<string>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => reject(Error(`worker exited before ready: ${code}`)));
        child.on('message', (message: { type?: string; url?: string; code?: string }) => {
          if (message.type === 'ready') resolve(message.url!);
          if (message.type === 'failure') reject(Error(message.code));
        });
        child.send({ id: randomUUID(), background });
      });
      return { child, exited, ready };
    };
    try {
      let worker = await start(mode === 'background');
      if (mode === 'forced-restart') {
        const intent = (await read()).login_intent_epoch;
        worker.child.kill('SIGKILL');
        await worker.exited;
        worker = await start();
        expect((await read()).login_intent_epoch).toBeGreaterThan(intent);
        worker.child.send({ type: 'cancel' });
      } else if (mode === 'disconnect' || mode === 'background') worker.child.disconnect();
      else if (mode === 'cancel') worker.child.send({ type: 'cancel' });
      else worker.child.kill(mode as NodeJS.Signals);
      if (mode === 'background') {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const state = new URL(worker.ready).searchParams.get('state');
        const response = await fetch(
          `http://127.0.0.1:18765/oauth/callback?state=${state}&code=fixture`,
          {
            signal: AbortSignal.timeout(5000),
            headers: { connection: 'close' },
          },
        );
        expect(response.status).toBe(200);
      }
      await worker.exited;
      const state = await read();
      expect(state.pending).toBeUndefined();
      if (mode === 'background') expect(state.credentials.oauth.known_state).toBe('available');
      const listener = await listenForCallback(randomUUID());
      listener.close();
    } finally {
      for (const child of workers) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  20000,
);
test('invalid callbacks do not consume the pending attempt; valid callback is accepted once', async () => {
  const state = randomBytes(16).toString('hex');
  const callback = await listenForCallback(state);
  try {
    for (const suffix of [
      '/favicon.ico',
      '/oauth/callback?state=wrong&code=one',
      `/oauth/callback?state=${state}&state=${state}&code=one`,
    ]) {
      const invalid = await fetch('http://127.0.0.1:18765' + suffix, {
        headers: { connection: 'close' },
      });
      expect(invalid.status).toBe(400);
      await invalid.text();
    }
    const url = `http://127.0.0.1:18765/oauth/callback?state=${state}&code=one`;
    const response = fetch(url, { headers: { connection: 'close' } });
    expect((await callback.result).searchParams.get('code')).toBe('one');
    await callback.finish(true);
    const reply = await response;
    expect(reply.status).toBe(200);
    expect(await reply.text()).toContain('登录成功');
  } finally {
    callback.close();
  }
});

test('cancellation after an accepted callback returns a complete Chinese failure page', async () => {
  const state = randomBytes(16).toString('hex');
  const abort = new AbortController();
  const callback = await listenForCallback(state, abort.signal, 'zh-CN');
  try {
    const response = fetch(`http://127.0.0.1:18765/oauth/callback?state=${state}&code=fixture`, {
      headers: { connection: 'close' },
    });
    await callback.result;
    abort.abort();
    const result = await response;
    expect(result.status).toBe(400);
    const body = await result.text();
    expect(body).toContain('登录未完成');
    expect(body).not.toContain(state);
    await callback.finish(true);
  } finally {
    callback.close();
  }
});

test.each(process.platform === 'win32' ? ['parent', 'tree'] : ['parent'])(
  'worker lifecycle after terminating %s',
  async (mode) => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'finance-worker-'));
    const parent = spawn(
      process.execPath,
      ['tests/fixtures/oauth-worker-process.mjs', 'parent', home],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '' },
      },
    );
    let workerPid: number | undefined;
    try {
      const ready = await new Promise<{ url: string; pid: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('worker not ready')), 20000);
        let output = '';
        parent.stdout.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('\n')) {
            clearTimeout(timer);
            resolve(JSON.parse(output.split('\n')[0]!));
          }
        });
        parent.once('error', reject);
        parent.once('exit', () => {
          clearTimeout(timer);
          reject(Error('parent exited before ready'));
        });
      });
      workerPid = ready.pid;
      const state = new URL(ready.url).searchParams.get('state');
      if (mode === 'tree') {
        await execa('taskkill.exe', ['/PID', String(parent.pid), '/T', '/F'], { reject: false });
        expect(() => process.kill(workerPid!, 0)).toThrow();
      } else parent.kill();
      const callback = `http://127.0.0.1:18765/oauth/callback?state=${state}&code=fixture-code`;
      if (mode === 'tree')
        await expect(fetch(callback, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();
      else {
        expect((await fetch(callback, { signal: AbortSignal.timeout(15000) })).status).toBe(200);
        const keyring = {
          async get() {
            return undefined;
          },
          async set() {},
          async delete() {
            return false;
          },
          async listAccounts() {
            return [];
          },
        };
        const saved = await new GlobalCredentialStore(
          authPaths(() => home),
          keyring,
          'file',
        ).read();
        expect(saved!.active_method).toBe('oauth');
        expect(saved!.credentials.oauth?.known_state).toBe('available');
      }
    } finally {
      parent.kill();
      if (workerPid) {
        try {
          process.kill(workerPid);
        } catch {
          /* fixture already exited */
        }
      }
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  60000,
);
