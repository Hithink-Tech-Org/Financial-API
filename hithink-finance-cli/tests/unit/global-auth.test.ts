import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { authPaths, assertAuthRuntime } from '../../src/infrastructure/credentials/auth-paths.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { GlobalAuthProvider } from '../../src/infrastructure/credentials/global-provider.js';
import type { CredentialStore } from '../../src/infrastructure/credentials/keyring.js';
import { privatePaths } from '../../src/infrastructure/credentials/auth-files.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-auth-'));
  directories.push(home);
  const values = new Map<string, string>();
  const keyring: CredentialStore = {
    async get(k) {
      return values.get(k);
    },
    async set(k, v) {
      values.set(k, v);
    },
    async delete(k) {
      return values.delete(k);
    },
    async listAccounts() {
      return [...values.keys()];
    },
  };
  const paths = authPaths(() => home);
  const store = new GlobalCredentialStore(paths, keyring);
  return { home, paths, store, values, keyring };
}

test('auth paths use OS identity and reject unavailable home and unsupported runtimes', () => {
  expect(authPaths(() => os.tmpdir()).root).toBe(
    path.join(os.tmpdir(), '.hithink-finance', 'auth', 'production'),
  );
  expect(() =>
    authPaths(() => {
      throw Error();
    }),
  ).toThrowError(expect.objectContaining({ code: 'AUTH_HOME_UNAVAILABLE' }));
  for (const version of ['22.12.0', '23.0.0', '23.9.0', '20.19.0'])
    expect(() => assertAuthRuntime(version)).toThrow();
  for (const version of ['22.13.0', '24.0.0', '25.0.0'])
    expect(() => assertAuthRuntime(version)).not.toThrow();
});

test('empty read creates no state or lock and does not load keyring', async () => {
  const { paths, store } = await fixture();
  expect(await store.read()).toBeUndefined();
  await expect(readFile(paths.lock)).rejects.toMatchObject({ code: 'ENOENT' });
});

test.each([
  { method: 'oauth' as const, binding: 'current', configured: true, connected: true },
  { method: 'oauth' as const, binding: 'previous', configured: true, connected: false },
  { method: 'api-key' as const, binding: 'previous', configured: true, connected: true },
  { method: 'oauth' as const, binding: 'previous', configured: false, connected: true },
])('status and selection respect delivery binding: %j', async (scenario) => {
  const f = await fixture();
  const network = vi.fn(async () => undefined);
  await f.store.transaction(async (state) => {
    state.credentials.oauth = {
      ...(await f.store.seal(state, 'oauth', { access_token: randomBytes(24).toString('hex') })),
      binding: scenario.binding,
      expires_at: Date.now() + 60000,
    };
    state.credentials['api-key'] = await f.store.seal(state, 'api-key', {
      api_key: randomBytes(24).toString('hex'),
    });
    state.active_method = scenario.method;
  });
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.keyring,
    env: {},
    validateKey: network,
    validateOAuth: network,
    ...(scenario.configured
      ? {
          oauth: {
            binding: 'current',
            apiOrigin: 'https://api.example.test',
            refresh: vi.fn(),
            revoke: network,
          },
        }
      : {}),
  });
  const before = await readFile(f.paths.document, 'utf8');
  const status = await provider.status();
  expect(status.connected).toBe(scenario.connected);
  const mismatch = scenario.configured && scenario.binding !== 'current';
  expect(status.credentials.oauth.state).toBe(mismatch ? 'login_required' : 'available');
  expect(await readFile(f.paths.document, 'utf8')).toBe(before);
  if (mismatch) {
    await expect(provider.use('oauth')).rejects.toMatchObject({ code: 'AUTH_LOGIN_REQUIRED' });
    expect(await readFile(f.paths.document, 'utf8')).toBe(before);
  }
  expect(network).not.toHaveBeenCalled();
});

test('explicit diagnostics reject an unsafe credential directory', async () => {
  const f = await fixture();
  await f.store.transaction(async () => undefined);
  try {
    if (process.platform === 'win32')
      await promisify(execFile)('icacls.exe', [f.paths.root, '/grant', '*S-1-1-0:(R)'], {
        windowsHide: true,
      });
    else await chmod(f.paths.root, 0o777);
    await expect(f.store.auditPermissions()).rejects.toMatchObject({
      code: 'AUTH_STORAGE_PERMISSIONS',
    });
  } finally {
    await privatePaths([f.paths.root], true);
  }
}, 30000);

test('OAuth intent initializes and imports credentials in the same committed revision', async () => {
  const f = await fixture();
  const key = randomBytes(24).toString('hex');
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.keyring,
    env: { HITHINK_FINANCE_API_KEY: key },
    validateKey: async () => undefined,
    validateOAuth: async () => undefined,
  });
  const pendingId = randomBytes(16).toString('hex');
  const intent = await provider.beginIntent(pendingId);
  const state = (await f.store.read())!;
  expect(state.revision).toBe(1);
  expect(state.active_method).toBe('api-key');
  expect(await f.store.open(state, 'api-key')).toEqual({ api_key: key });
  expect(state.pending).toMatchObject({ id: pendingId, intent, owner_pid: process.pid });
}, 30000);

test('trusted service environments keep independent credential files', async () => {
  const f = await fixture();
  const testStore = new GlobalCredentialStore(
    authPaths(() => f.home, 'test'),
    f.keyring,
  );
  const secret = randomBytes(24).toString('hex');
  await f.store.transaction(async (state) => {
    state.credentials['api-key'] = await f.store.seal(state, 'api-key', { api_key: secret });
  });
  await testStore.transaction(async (state) => {
    state.credentials = {};
  });
  expect(testStore.paths.lock).not.toBe(f.paths.lock);
  expect(await f.store.open((await f.store.read())!, 'api-key')).toEqual({ api_key: secret });
  expect((await testStore.read())!.credentials).toEqual({});
}, 30000);

test('logout invalidates an API key login waiting for validation', async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.keyring,
    env: {},
    validateOAuth: async () => undefined,
    validateKey: async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  });
  const login = provider.login({ apiKey: randomBytes(12).toString('hex') });
  const checked = expect(login).rejects.toMatchObject({ code: 'AUTH_LOGIN_SUPERSEDED' });
  await waiting;
  await provider.logoutAll();
  release();
  await checked;
  expect((await f.store.read())!.credentials).toEqual({});
}, 30000);

test('file credentials support large tokens and do not access a keyring root', async () => {
  const f = await fixture();
  const secret = randomBytes(6000).toString('base64');
  await f.store.transaction(async (state) => {
    state.credentials['api-key'] = await f.store.seal(state, 'api-key', { api_key: secret });
  });
  const state = (await f.store.read())!;
  expect(state.backend).toBe('file');
  expect(await f.store.open(state, 'api-key')).toEqual({ api_key: secret });
  expect(f.values.size).toBe(0);
  expect(JSON.parse(await readFile(f.paths.document, 'utf8')).schema_version).toBe(2);
}, 30000);

test('short transactions serialize concurrent updates and preserve prior state on failure', async () => {
  const { store } = await fixture();
  await Promise.all(
    Array.from({ length: 5 }, () =>
      store.transaction(async (state) => {
        state.selection_epoch++;
      }),
    ),
  );
  expect((await store.read())!.selection_epoch).toBe(5);
  await expect(
    store.transaction(async (state) => {
      state.selection_epoch = 99;
      throw Error('disk simulation');
    }),
  ).rejects.toThrow();
  expect((await store.read())!.selection_epoch).toBe(5);
}, 60000);

test('credential purge leaves an initialized empty file and cannot revive environment input', async () => {
  const f = await fixture();
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.keyring,
    env: { HITHINK_FINANCE_API_KEY: randomBytes(16).toString('hex') },
    validateKey: async () => undefined,
    validateOAuth: async () => undefined,
  });
  await provider.resolve();
  await provider.purge();
  const state = (await f.store.read())!;
  expect(state.initialized).toBe(true);
  expect(state.credentials).toEqual({});
  await expect(provider.resolve()).rejects.toMatchObject({ code: 'AUTH_LOGIN_REQUIRED' });
}, 30000);
