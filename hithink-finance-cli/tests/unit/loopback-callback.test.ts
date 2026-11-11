import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { listenForCallback } from '../../src/infrastructure/credentials/loopback-callback.js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
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
