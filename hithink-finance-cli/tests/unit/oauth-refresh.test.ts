import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  GlobalAuthProvider,
  type OAuthTokens,
  type OAuthTransport,
} from '../../src/infrastructure/credentials/global-provider.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-refresh-'));
  dirs.push(home);
  const keyring = {
    async get() {
      return undefined;
    },
    async set() {},
    async delete() {
      return true;
    },
    async listAccounts() {
      return [];
    },
  };
  const store = new GlobalCredentialStore(
    authPaths(() => home),
    keyring,
    'file',
  );
  const tokens: OAuthTokens = {
    access_token: randomBytes(12).toString('hex'),
    refresh_token: randomBytes(12).toString('hex'),
    expires_at: Date.now() - 1000,
    scope: 'openid offline_access read',
    subject: 'test-sub',
    binding: 'test-binding',
  };
  const transport: OAuthTransport = {
    binding: tokens.binding,
    apiOrigin: 'https://api.example.test',
    refresh: vi.fn(async () => ({
      ...tokens,
      access_token: randomBytes(12).toString('hex'),
      expires_at: Date.now() + 300000,
    })),
    revoke: vi.fn(async () => undefined),
  };
  const provider = new GlobalAuthProvider(store, {
    legacy: keyring,
    env: {},
    validateKey: async () => undefined,
    validateOAuth: async () => undefined,
    oauth: transport,
  });
  await provider.commitOAuth(await provider.beginIntent(), tokens);
  const session = await provider.resolve();
  if (session.method !== 'oauth') throw Error('wrong method');
  return { provider, store, session, transport, tokens };
}
test('a persisted uncertain claim never sends the old RT again; valid AT remains usable', async () => {
  const f = await fixture();
  vi.mocked(f.transport.refresh).mockRejectedValue(Error('connection lost'));
  await expect(f.session.accessToken()).rejects.toThrow();
  await expect(f.session.accessToken()).rejects.toMatchObject({ code: 'AUTH_REFRESH_UNCERTAIN' });
  expect(f.transport.refresh).toHaveBeenCalledTimes(1);
  expect((await f.provider.status()).connected).toBe(false);
  await f.store.transaction(async (state) => {
    state.credentials.oauth!.expires_at = Date.now() + 20000;
  });
  expect(await f.session.accessToken()).toBe(f.tokens.access_token);
  expect((await f.provider.status()).connected).toBe(true);
}, 60000);
test('refresh cannot reactivate OAuth after a switch, and competing refresh does not consume RT', async () => {
  const f = await fixture();
  await f.provider.login({ apiKey: randomBytes(12).toString('hex') });
  await f.provider.use('oauth');
  let complete!: (tokens: OAuthTokens) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((r) => {
    started = r;
  });
  vi.mocked(f.transport.refresh).mockImplementation(() => {
    started();
    return new Promise((r) => {
      complete = r;
    });
  });
  const request = f.session.accessToken();
  await startedPromise;
  await expect(f.session.accessToken()).rejects.toMatchObject({ code: 'AUTH_REFRESH_IN_PROGRESS' });
  await f.provider.use('api-key');
  complete({ ...f.tokens, expires_at: Date.now() + 300000 });
  await request;
  expect((await f.provider.status()).active_method).toBe('api-key');
  expect(f.transport.refresh).toHaveBeenCalledTimes(1);
}, 60000);
test('logout rejects a late refresh commit and leaves both credentials absent', async () => {
  const f = await fixture();
  let complete!: (tokens: OAuthTokens) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((r) => {
    started = r;
  });
  vi.mocked(f.transport.refresh).mockImplementation(() => {
    started();
    return new Promise((r) => {
      complete = r;
    });
  });
  const request = f.session.accessToken();
  const checked = expect(request).rejects.toMatchObject({ code: 'AUTH_LOGIN_SUPERSEDED' });
  await startedPromise;
  await f.provider.logoutAll();
  complete({ ...f.tokens, expires_at: Date.now() + 300000 });
  await checked;
  expect((await f.store.read())!.credentials).toEqual({});
}, 60000);
