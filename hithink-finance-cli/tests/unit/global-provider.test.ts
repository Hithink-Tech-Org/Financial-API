import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { GlobalAuthProvider } from '../../src/infrastructure/credentials/global-provider.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture(env: NodeJS.ProcessEnv = {}, withOAuth = false) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-provider-'));
  dirs.push(home);
  const keys = new Map<string, string>();
  const legacy = {
    get: vi.fn(async (k: string) => keys.get(k)),
    set: vi.fn(async (k: string, v: string) => {
      keys.set(k, v);
    }),
    delete: vi.fn(async (k: string) => keys.delete(k)),
    listAccounts: vi.fn(async () => [...keys.keys()]),
  };
  const store = new GlobalCredentialStore(
    authPaths(() => home),
    legacy,
    'file',
  );
  const validateKey = vi.fn(async () => undefined);
  const validateOAuth = vi.fn(async () => undefined);
  return {
    provider: new GlobalAuthProvider(store, {
      env,
      legacy,
      validateKey,
      validateOAuth,
      ...(withOAuth
        ? {
            oauth: {
              binding: 'fixture',
              apiOrigin: 'https://data.example.invalid',
              refresh: vi.fn(),
              revoke: vi.fn(),
            },
          }
        : {}),
    }),
    store,
    keys,
    legacy,
    validateKey,
    validateOAuth,
  };
}
test('explicit input does not access or initialize storage', async () => {
  const f = await fixture();
  f.legacy.get.mockRejectedValue(Error('locked'));
  const secret = randomBytes(12).toString('hex');
  expect(await f.provider.resolve('default', secret)).toMatchObject({
    method: 'api-key',
    apiKey: secret,
    source: 'explicit',
  });
  expect(await f.store.read()).toBeUndefined();
});

test.each(['default-login', 'background-intent'])(
  'fresh OAuth %s does not depend on the legacy credential store',
  async (entry) => {
    const f = await fixture({}, true);
    const oldKey = randomBytes(16).toString('hex');
    f.keys.set('profile:default', oldKey);
    f.legacy.listAccounts.mockRejectedValue(Error('keychain unavailable'));
    f.legacy.get.mockRejectedValue(Error('keychain unavailable'));
    if (entry === 'default-login') expect(await f.provider.loginMethod()).toBe('oauth');
    const intent = await f.provider.beginIntent(randomBytes(12).toString('hex'));
    await f.provider.commitOAuth(intent, {
      access_token: randomBytes(16).toString('hex'),
      expires_at: Date.now() + 60000,
      scope: 'base_userinfo offline_access fuyao:data.read',
      binding: 'fixture',
    });
    expect((await f.provider.status()).connected).toBe(true);
    expect(f.legacy.listAccounts).not.toHaveBeenCalled();
    expect(f.legacy.get).not.toHaveBeenCalled();
    expect(f.legacy.set).not.toHaveBeenCalled();
    expect(f.legacy.delete).not.toHaveBeenCalled();
    expect(f.keys.get('profile:default')).toBe(oldKey);
  },
  30000,
);

test('OAuth-capable initialization imports the environment key once without keychain access', async () => {
  const key = randomBytes(16).toString('hex');
  const env = { HITHINK_FINANCE_API_KEY: key };
  const f = await fixture(env, true);
  f.legacy.listAccounts.mockRejectedValue(Error('keychain unavailable'));
  expect(await f.provider.loginMethod()).toBe('api-key');
  env.HITHINK_FINANCE_API_KEY = randomBytes(16).toString('hex');
  expect(await f.provider.resolve()).toMatchObject({ method: 'api-key', apiKey: key });
  expect(f.legacy.listAccounts).not.toHaveBeenCalled();
}, 30000);

test('explicit migration can still import an old key after a fresh OAuth login', async () => {
  const f = await fixture({}, true);
  const key = randomBytes(16).toString('hex');
  f.keys.set('profile:default', key);
  await f.provider.commitOAuth(await f.provider.beginIntent(randomBytes(12).toString('hex')), {
    access_token: randomBytes(16).toString('hex'),
    expires_at: Date.now() + 60000,
    scope: 'base_userinfo offline_access fuyao:data.read',
    binding: 'fixture',
  });
  await f.provider.migrate('default');
  expect(await f.provider.resolve()).toMatchObject({ method: 'api-key', apiKey: key });
  expect((await f.store.read())!.credentials.oauth).toBeDefined();
  expect(f.validateKey).toHaveBeenCalledWith(key);
  expect(f.keys.get('profile:default')).toBe(key);
  expect(f.legacy.delete).not.toHaveBeenCalled();
}, 30000);

test('method selection and request resolution reuse their validated state snapshot', async () => {
  const f = await fixture({ HITHINK_FINANCE_API_KEY: randomBytes(12).toString('hex') });
  await f.provider.resolve();
  const read = vi.spyOn(f.store, 'read');
  expect(await f.provider.loginMethod()).toBe('api-key');
  expect(read).toHaveBeenCalledOnce();
  read.mockClear();
  expect((await f.provider.resolve()).method).toBe('api-key');
  expect(read).toHaveBeenCalledOnce();
}, 30000);

test('first OAuth HTTP request reuses one snapshot; later requests observe logout', async () => {
  const f = await fixture();
  const access = randomBytes(20).toString('hex');
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.legacy,
    env: {},
    validateKey: f.validateKey,
    validateOAuth: f.validateOAuth,
    oauth: {
      binding: 'fixture',
      apiOrigin: 'https://data.example.invalid',
      refresh: async () => {
        throw Error('not expired');
      },
      revoke: async () => undefined,
    },
  });
  await provider.commitOAuth(await provider.beginIntent(), {
    access_token: access,
    expires_at: Date.now() + 60000,
    scope: 'read',
    binding: 'fixture',
  });
  const read = vi.spyOn(f.store, 'read');
  const session = await provider.resolve();
  if (session.method !== 'oauth') throw Error('Expected OAuth');
  expect(await session.accessToken()).toBe(access);
  expect(read).toHaveBeenCalledOnce();
  await provider.logoutAll();
  await expect(session.accessToken()).rejects.toMatchObject({ code: 'AUTH_LOGIN_REQUIRED' });
}, 30000);

test('a first-request snapshot that expires before use refreshes the same session', async () => {
  const f = await fixture();
  const fresh = randomBytes(20).toString('hex');
  const provider = new GlobalAuthProvider(f.store, {
    legacy: f.legacy,
    env: {},
    validateKey: f.validateKey,
    validateOAuth: f.validateOAuth,
    oauth: {
      binding: 'fixture',
      apiOrigin: 'https://data.example.invalid',
      refresh: async () => ({
        access_token: fresh,
        refresh_token: randomBytes(20).toString('hex'),
        expires_at: Date.now() + 60000,
        scope: 'read',
        binding: 'fixture',
      }),
      revoke: async () => undefined,
    },
  });
  await provider.commitOAuth(await provider.beginIntent(), {
    access_token: randomBytes(20).toString('hex'),
    refresh_token: randomBytes(20).toString('hex'),
    expires_at: Date.now() + 1000,
    scope: 'read',
    binding: 'fixture',
  });
  const session = await provider.resolve();
  if (session.method !== 'oauth') throw Error('Expected OAuth');
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
  try {
    expect(await session.accessToken()).toBe(fresh);
  } finally {
    clock.mockRestore();
  }
}, 30000);
test('imports once, logout cannot revive environment, failed login preserves committed key', async () => {
  const env = { HITHINK_FINANCE_API_KEY: randomBytes(12).toString('hex') };
  const f = await fixture(env);
  expect((await f.provider.resolve('default')).method).toBe('api-key');
  env.HITHINK_FINANCE_API_KEY = randomBytes(12).toString('hex');
  f.validateKey.mockRejectedValueOnce(Error('rejected'));
  await expect(
    f.provider.login({ profile: 'default', apiKey: env.HITHINK_FINANCE_API_KEY }),
  ).rejects.toThrow();
  expect((await f.provider.status()).connected).toBe(true);
  await f.provider.logoutAll();
  expect((await f.provider.status()).connected).toBe(false);
  await expect(f.provider.resolve('default')).rejects.toMatchObject({
    code: 'AUTH_LOGIN_REQUIRED',
  });
}, 60000);

test('OAuth resource probe succeeds before activating a subject-free credential', async () => {
  const f = await fixture();
  const token = {
    access_token: randomBytes(24).toString('hex'),
    refresh_token: randomBytes(24).toString('hex'),
    scope: 'offline_access read',
    binding: 'test',
    expires_at: Date.now() + 60000,
  };
  await f.provider.commitOAuth(await f.provider.beginIntent(), token);
  expect(f.validateOAuth).toHaveBeenCalledOnce();
  expect((await f.provider.status()).active_method).toBe('oauth');
  expect((await f.store.read())!.credentials.oauth!.subject).toBeUndefined();
}, 30000);

test('failed OAuth resource probe keeps the committed API key and active selection', async () => {
  const f = await fixture({ HITHINK_FINANCE_API_KEY: randomBytes(24).toString('hex') });
  await f.provider.resolve();
  f.validateOAuth.mockRejectedValueOnce(Error('resource unavailable'));
  await expect(
    f.provider.commitOAuth(await f.provider.beginIntent(), {
      access_token: randomBytes(24).toString('hex'),
      refresh_token: randomBytes(24).toString('hex'),
      scope: 'offline_access read',
      binding: 'test',
      expires_at: Date.now() + 60000,
    }),
  ).rejects.toThrow('resource unavailable');
  expect((await f.provider.status()).active_method).toBe('api-key');
  expect((await f.store.read())!.credentials.oauth).toBeUndefined();
}, 30000);

test('logout during OAuth resource probe is unlocked and prevents a late commit', async () => {
  const f = await fixture();
  f.validateOAuth.mockImplementationOnce(async () => {
    await f.provider.logoutAll();
  });
  await expect(
    f.provider.commitOAuth(await f.provider.beginIntent(), {
      access_token: randomBytes(24).toString('hex'),
      refresh_token: randomBytes(24).toString('hex'),
      scope: 'offline_access read',
      binding: 'test',
      expires_at: Date.now() + 60000,
    }),
  ).rejects.toMatchObject({ code: 'AUTH_LOGIN_SUPERSEDED' });
  expect((await f.provider.status()).connected).toBe(false);
}, 30000);

test('cancellation during OAuth resource probe prevents credential persistence', async () => {
  const f = await fixture();
  const abort = new AbortController();
  f.validateOAuth.mockImplementationOnce(async () => {
    abort.abort();
  });
  await expect(
    f.provider.commitOAuth(
      await f.provider.beginIntent(),
      {
        access_token: randomBytes(24).toString('hex'),
        refresh_token: randomBytes(24).toString('hex'),
        scope: 'offline_access read',
        binding: 'test',
        expires_at: Date.now() + 60000,
      },
      abort.signal,
    ),
  ).rejects.toMatchObject({ code: 'AUTH_LOGIN_CANCELLED' });
  expect((await f.provider.status()).connected).toBe(false);
}, 30000);
test('ambiguous legacy selection is not committed and default takes precedence over env', async () => {
  const f = await fixture({ HITHINK_FINANCE_API_KEY: randomBytes(12).toString('hex') });
  f.keys.set('profile:a', randomBytes(12).toString('hex'));
  f.keys.set('profile:b', randomBytes(12).toString('hex'));
  await expect(f.provider.resolve('default')).rejects.toMatchObject({
    code: 'AUTH_MIGRATION_REQUIRED',
  });
  expect(await f.store.read()).toBeUndefined();
  f.keys.set('profile:default', randomBytes(12).toString('hex'));
  expect(await f.provider.resolve('default')).toMatchObject({
    apiKey: f.keys.get('profile:default'),
  });
}, 60000);
