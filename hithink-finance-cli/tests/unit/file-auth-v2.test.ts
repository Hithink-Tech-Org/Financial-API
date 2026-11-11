import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
import {
  ensureAuthDirectory,
  writeAuthAtomic,
} from '../../src/infrastructure/credentials/auth-files.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-file-v2-'));
  homes.push(home);
  const paths = authPaths(() => home, 'test');
  const keys = new Map<string, string>();
  const keyring = {
    get: vi.fn(async (key: string) => keys.get(key)),
    set: vi.fn(async (key: string, value: string) => {
      keys.set(key, value);
    }),
    delete: vi.fn(async (key: string) => keys.delete(key)),
    listAccounts: vi.fn(async () => [...keys.keys()]),
  };
  return { paths, keys, keyring, store: new GlobalCredentialStore(paths, keyring) };
}
function legacy(secret: Record<string, string>) {
  return {
    schema_version: 1,
    environment: 'test',
    backend: 'file',
    key_id: randomUUID(),
    initialized: true,
    revision: 2,
    active_method: 'api-key',
    selection_epoch: 1,
    login_intent_epoch: 3,
    credentials: {
      'api-key': { session_id: randomUUID(), session_version: 4, known_state: 'available', secret },
    },
  };
}

test('an inherited or broad pre-existing empty directory cannot receive credentials', async () => {
  const f = await fixture();
  await mkdir(f.paths.root, { recursive: true, mode: 0o755 });
  const action = vi.fn(async () => undefined);
  await expect(f.store.transaction(action)).rejects.toMatchObject({
    code: 'AUTH_STORAGE_PERMISSIONS',
  });
  expect(action).not.toHaveBeenCalled();
  await expect(readFile(f.paths.document)).rejects.toMatchObject({ code: 'ENOENT' });
}, 30000);
test('new writes use a v2 file and never create a keyring root', async () => {
  const f = await fixture();
  const key = randomBytes(20).toString('hex');
  await f.store.transaction(async (state) => {
    state.credentials['api-key'] = await f.store.seal(state, 'api-key', { api_key: key });
  });
  const saved = await f.store.read();
  expect(saved).toMatchObject({ schema_version: 2, backend: 'file' });
  expect(await f.store.open(saved!, 'api-key')).toEqual({ api_key: key });
  expect(f.keyring.get).not.toHaveBeenCalled();
  expect(f.keyring.set).not.toHaveBeenCalled();
}, 30000);

test.each(['file', 'keyring'])(
  'old %s state migrates once, preserving identity and selection',
  async (backend) => {
    const f = await fixture();
    const key = randomBytes(20).toString('hex');
    const old = legacy({ api_key: key });
    old.backend = backend;
    if (backend === 'keyring') {
      const root = randomBytes(32),
        nonce = randomBytes(12);
      f.keys.set('global-root:' + old.key_id, root.toString('base64'));
      const credential = old.credentials['api-key'];
      const cipher = createCipheriv('aes-256-gcm', root, nonce);
      cipher.setAAD(
        Buffer.from(
          JSON.stringify([1, backend, 'test', old.key_id, 'api-key', credential.session_id]),
        ),
      );
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(credential.secret)),
        cipher.final(),
      ]);
      credential.secret = {
        nonce: nonce.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: encrypted.toString('base64'),
      };
    }
    await ensureAuthDirectory(f.paths.root);
    await writeAuthAtomic(f.paths.document, old);
    const before = await readFile(f.paths.document, 'utf8');
    await expect(f.store.read()).rejects.toMatchObject({ code: 'AUTH_MIGRATION_REQUIRED' });
    expect(await readFile(f.paths.document, 'utf8')).toBe(before);
    await f.store.transaction(async () => undefined);
    const state = (await f.store.read())!;
    expect(state).toMatchObject({
      schema_version: 2,
      backend: 'file',
      active_method: 'api-key',
      selection_epoch: 1,
      login_intent_epoch: 3,
    });
    expect(state.credentials['api-key']?.session_id).toBe(old.credentials['api-key'].session_id);
    expect(await f.store.open(state, 'api-key')).toEqual({ api_key: key });
    const reads = f.keyring.get.mock.calls.length;
    await f.store.read();
    await f.store.open(state, 'api-key');
    expect(f.keyring.get.mock.calls.length).toBe(reads);
  },
  30000,
);

test.each(['pending', 'refresh', 'purge'])(
  'old running %s operation blocks migration without overwriting state',
  async (operation) => {
    const f = await fixture();
    const old: Record<string, unknown> = legacy({ api_key: randomUUID() });
    if (operation === 'pending')
      old.pending = {
        id: randomUUID(),
        intent: 3,
        owner_pid: process.pid,
        expires_at: Date.now() + 30000,
      };
    if (operation === 'purge') old.purge_pending = true;
    if (operation === 'refresh')
      old.credentials = {
        oauth: {
          session_id: randomUUID(),
          session_version: 1,
          known_state: 'available',
          secret: { access_token: randomUUID() },
          refresh_claim: {
            operation_id: randomUUID(),
            session_version: 1,
            owner_pid: process.pid,
            owner_id: randomUUID(),
            started_at: Date.now(),
            state: 'in_flight',
          },
        },
      };
    await ensureAuthDirectory(f.paths.root);
    await writeAuthAtomic(f.paths.document, old);
    const before = await readFile(f.paths.document, 'utf8');
    await expect(f.store.transaction(async () => undefined)).rejects.toMatchObject({
      code: 'AUTH_STORAGE_BUSY',
    });
    expect(await readFile(f.paths.document, 'utf8')).toBe(before);
  },
  30000,
);

test('expired pending metadata cannot strand migration after PID reuse', async () => {
  const f = await fixture();
  const old = {
    ...legacy({ api_key: randomUUID() }),
    pending: { id: randomUUID(), intent: 3, owner_pid: process.pid, expires_at: Date.now() - 1000 },
  };
  await ensureAuthDirectory(f.paths.root);
  await writeAuthAtomic(f.paths.document, old);
  await f.store.transaction(async () => undefined);
  expect(await f.store.read()).toMatchObject({
    login_intent_epoch: 4,
    credentials: { 'api-key': { known_state: 'available' } },
  });
  expect((await f.store.read())!.pending).toBeUndefined();
}, 30000);

test('a stale refresh migrates as uncertain and keeps its session version', async () => {
  const f = await fixture();
  const operation = randomUUID();
  const old = {
    ...legacy({}),
    credentials: {
      oauth: {
        session_id: randomUUID(),
        session_version: 7,
        known_state: 'available',
        secret: { access_token: randomUUID(), refresh_token: randomUUID() },
        refresh_claim: {
          operation_id: operation,
          session_version: 7,
          owner_pid: process.pid,
          owner_id: randomUUID(),
          started_at: Date.now() - 31000,
          state: 'in_flight',
        },
      },
    },
  };
  await ensureAuthDirectory(f.paths.root);
  await writeAuthAtomic(f.paths.document, old);
  await f.store.transaction(async () => undefined);
  expect((await f.store.read())!.credentials.oauth).toMatchObject({
    session_version: 7,
    refresh_claim: { operation_id: operation, state: 'uncertain' },
  });
}, 30000);
