import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { buildId, identity, workerEnvironment } from '../../src/cli/worker/paths.js';
import { eligible } from '../../src/cli/worker/client.js';

test('building/failed builds cannot retain a ready identity; runtime, package and environment are isolated', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'finance-build-id-'));
  try {
    await mkdir(path.join(root, 'dist'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    const file = path.join(root, 'dist/runtime-build.json');
    expect(await buildId(root)).toBeUndefined();
    await writeFile(file, JSON.stringify({ phase: 'ready', id: randomBytes(32).toString('hex') }));
    const first = await identity(root, {});
    expect(
      (await identity(root, { HITHINK_FINANCE_API_KEY: randomBytes(16).toString('hex') }))?.id,
    ).toBe(first?.id);
    expect(
      (await identity(root, { HITHINK_FINANCE_FUYAO_BASE_URL: 'https://example.com' }))?.id,
    ).not.toBe(first?.id);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.1' }));
    expect((await identity(root, {}))?.id).not.toBe(first?.id);
    await writeFile(file, JSON.stringify({ phase: 'building' }));
    await expect(identity(root)).rejects.toMatchObject({ code: 'CLI_BUILD_NOT_READY' });
    await writeFile(path.join(root, 'dist/partial.js'), 'export const partial = true;');
    await expect(identity(root)).rejects.toMatchObject({ code: 'CLI_BUILD_NOT_READY' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('worker process environment excludes business credentials and routing excludes local/mutating commands', () => {
  const sentinel = randomBytes(16).toString('hex');
  expect(
    workerEnvironment({
      HITHINK_FINANCE_API_KEY: sentinel,
      API_KEY: sentinel,
      FUYAO_TOKEN: sentinel,
      LANG: 'en',
    }),
  ).toEqual({ LANG: 'en' });
  expect(
    workerEnvironment({
      SSL_CERT_FILE: 'ca.pem',
      OPENSSL_CONF: 'openssl.cnf',
      XDG_RUNTIME_DIR: 'runtime',
    }),
  ).toEqual({
    SSL_CERT_FILE: path.resolve('ca.pem'),
    OPENSSL_CONF: path.resolve('openssl.cnf'),
    XDG_RUNTIME_DIR: 'runtime',
  });
  const routes = [
    ['market', 'snapshot'],
    ['market', 'history'],
  ];
  expect(eligible(['market', 'snapshot'], routes)).toBe(true);
  expect(eligible(['--format', 'json', 'market', 'snapshot'], routes)).toBe(true);
  expect(eligible(['--format=json', 'market', '--lang', 'en', 'snapshot'], routes)).toBe(true);
  expect(eligible(['market', 'snapshot', '--help'], routes)).toBe(false);
  expect(eligible(['market', 'history'], routes)).toBe(false);
  expect(eligible(['market', 'history', '--source=remote'], routes)).toBe(true);
  expect(eligible(['auth', 'logout'], routes)).toBe(false);
});

test('runtime-relative certificate and module paths are interpreted in the caller cwd', () => {
  const a = path.resolve('project-a'),
    b = path.resolve('project-b');
  const env = {
    NODE_EXTRA_CA_CERTS: 'ca.pem',
    NODE_PATH: ['modules', 'shared'].join(path.delimiter),
  };
  expect(workerEnvironment(env, a).NODE_EXTRA_CA_CERTS).toBe(path.join(a, 'ca.pem'));
  expect(workerEnvironment(env, b).NODE_EXTRA_CA_CERTS).toBe(path.join(b, 'ca.pem'));
  expect(workerEnvironment(env, b).NODE_PATH).toBe(
    [path.join(b, 'modules'), path.join(b, 'shared')].join(path.delimiter),
  );
});
