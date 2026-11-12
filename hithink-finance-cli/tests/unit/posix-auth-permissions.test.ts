import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { privatePaths } from '../../src/infrastructure/credentials/auth-files.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';

const fs = vi.hoisted(() => ({ lstat: vi.fn(), chmod: vi.fn(), open: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  ...fs,
}));
const processObject = process;
const target = path.join(os.tmpdir(), 'finance-posix-policy', 'auth.json');
function identity(uid: number) {
  vi.stubGlobal(
    'process',
    new Proxy(processObject, {
      get(object, key) {
        if (key === 'platform') return 'linux';
        if (key === 'getuid') return () => uid;
        return Reflect.get(object, key);
      },
    }),
  );
}
function info(uid: number, mode = 0o600, directory = false) {
  return {
    uid,
    ino: 1,
    dev: 1,
    nlink: 1,
    gid: uid,
    mode,
    isSymbolicLink: () => false,
    isDirectory: () => directory,
    isFile: () => !directory,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test.each([
  { uid: 1000, owner: 1000 },
  { uid: 0, owner: 1000 },
  { uid: 1000, owner: 0 },
])('accepts current-user and root ownership contexts: %j', async ({ uid, owner }) => {
  identity(uid);
  fs.lstat.mockResolvedValue(info(owner));
  await expect(privatePaths([target])).resolves.toBeUndefined();
  expect(fs.open).not.toHaveBeenCalled();
});

test('accepts a searchable directory without group or other write access', async () => {
  identity(1000);
  fs.lstat.mockResolvedValue(info(1000, 0o755, true));
  await expect(privatePaths([target])).resolves.toBeUndefined();
});

test('an actual read denial remains a permissions error', async () => {
  identity(1000);
  fs.lstat.mockResolvedValue(info(0));
  fs.readFile.mockRejectedValueOnce(Object.assign(Error('denied'), { code: 'EACCES' }));
  const store = new GlobalCredentialStore(
    authPaths(() => os.tmpdir()),
    {
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
    },
  );
  await expect(store.read()).rejects.toMatchObject({
    code: 'AUTH_STORAGE_PERMISSIONS',
    category: 'local-data',
  });
});

test.each([
  { owner: 2000, mode: 0o600, directory: false },
  { owner: 1000, mode: 0o644, directory: false },
  { owner: 1000, mode: 0o777, directory: true },
])('rejects unsafe ownership or access: %j', async ({ owner, mode, directory }) => {
  identity(1000);
  fs.lstat.mockResolvedValue(info(owner, mode, directory));
  await expect(privatePaths([target])).rejects.toMatchObject({ code: 'AUTH_STORAGE_PERMISSIONS' });
});

test('root-created private files preserve the mounted user directory ownership', async () => {
  identity(0);
  fs.lstat.mockResolvedValueOnce(info(0)).mockResolvedValueOnce(info(1000, 0o700, true));
  const handle = {
    stat: vi.fn(async () => info(0)),
    chmod: vi.fn(),
    chown: vi.fn(),
    close: vi.fn(),
  };
  fs.open.mockResolvedValue(handle);
  await privatePaths([target], true);
  expect(handle.chmod).toHaveBeenCalledWith(0o600);
  expect(handle.chown).toHaveBeenCalledWith(1000, 1000);
  expect(handle.close).toHaveBeenCalledOnce();
});

test.each([
  { ino: 2, nlink: 1 },
  { ino: 1, nlink: 2 },
])('root refuses replaced or hard-linked files: %j', async (metadata) => {
  identity(0);
  fs.lstat.mockResolvedValue(info(0));
  const handle = {
    stat: vi.fn(async () => ({ ...info(0), ...metadata })),
    chmod: vi.fn(),
    chown: vi.fn(),
    close: vi.fn(),
  };
  fs.open.mockResolvedValue(handle);
  await expect(privatePaths([target], true)).rejects.toMatchObject({
    code: 'AUTH_STORAGE_PERMISSIONS',
  });
  expect(handle.chown).not.toHaveBeenCalled();
  expect(handle.chmod).not.toHaveBeenCalled();
  expect(handle.close).toHaveBeenCalledOnce();
});
