import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const run = promisify(execFile);
if (!process.env.npm_execpath) throw Error('Run through npm run verify:auth-package.');
const root = await mkdtemp(path.join(os.tmpdir(), 'finance-package-'));
const home = path.join(root, 'user');
await mkdir(home);
const key = randomUUID();
let probes = 0;
const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.headers['x-api-key'] !== key) {
    response.end(JSON.stringify({ code: 2001, message: 'unauthorized', data: null }));
    return;
  }
  probes++;
  response.end(JSON.stringify({ code: 0, message: 'ok', data: { timestamp: 1, item: [] } }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const shim = path.join(root, 'user-adapter.mjs');
await writeFile(
  shim,
  `
import os from 'node:os';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const original = os.userInfo;
os.userInfo = (...args) => { if(process.env.TEST_AUTH_HOME_FAILURE) throw Error('unavailable OS home'); return {...original(...args), homedir: process.env.TEST_AUTH_USER}; };
syncBuiltinESMExports();
const {KeyringCredentialStore} = await import(pathToFileURL(path.join(process.env.TEST_PACKAGE, 'dist/infrastructure/credentials/keyring.js')).href);
KeyringCredentialStore.prototype.supportsPersistentStorage = () => false;
`,
);
const env = { ...process.env, NODE_OPTIONS: '', HITHINK_FINANCE_NO_UPDATE_CHECK: '1' };
async function npm(args) {
  return run(process.execPath, [process.env.npm_execpath, ...args], {
    env,
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
try {
  const packed = JSON.parse((await npm(['pack', '--json', '--pack-destination', root])).stdout)[0];
  const files = new Set(packed.files.map((item) => item.path));
  assert(files.has('dist/infrastructure/credentials/auth-worker.js'));
  assert(files.has('npm-shrinkwrap.json'));
  assert(![...files].some((file) => file.startsWith('tests/') || file.includes('auth.json')));
  const packages = [];
  for (const copy of ['a', 'b']) {
    const prefix = path.join(root, copy);
    await npm([
      'install',
      '--prefix',
      prefix,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      path.join(root, packed.filename),
    ]);
    const pkg = path.join(prefix, 'node_modules/@hithink-tech/hithink-finance-cli');
    packages.push(pkg);
    const native = path.dirname(
      createRequire(path.join(pkg, 'package.json')).resolve('@napi-rs/keyring'),
    );
    const resolved = await realpath(native);
    assert(!path.relative(root, resolved).startsWith('..') && resolved !== root);
    await rename(resolved, resolved + '.missing');
  }
  async function cli(index, args, options = {}) {
    const pkg = packages[index];
    const childEnv = {
      ...env,
      NODE_OPTIONS: `--import="${pathToFileURL(shim).href}"`,
      TEST_PACKAGE: pkg,
      TEST_AUTH_USER: home,
      HOME: path.join(root, `host-${index}`),
      XDG_CONFIG_HOME: path.join(root, `xdg-${index}`),
      APPDATA: path.join(root, `app-${index}`),
      HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      ...options.env,
    };
    return new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [path.join(pkg, 'dist/cli/main.js'), ...args, '--format', 'json'],
        { env: childEnv, cwd: root, windowsHide: true, timeout: 20000 },
        (error, stdout, stderr) => {
          assert(!`${stdout}${stderr}`.includes(key));
          if (error && !options.failure) reject(error);
          else resolve({ stdout, stderr, code: error?.code ?? 0 });
        },
      );
      child.stdin.end(options.input ?? '');
    });
  }
  await cli(0, ['auth', 'login', '--api-key-stdin'], { input: key });
  assert.equal(probes, 1);
  assert.equal(JSON.parse((await cli(1, ['auth', 'status'])).stdout).data.connected, true);
  await cli(1, ['symbol', 'search', '--q', 'test', '--api-key-stdin'], {
    input: key,
    env: { TEST_AUTH_HOME_FAILURE: '1' },
  });
  assert.equal(probes, 2);
  await cli(1, ['auth', 'logout', '--all']);
  const disconnected = await cli(0, ['auth', 'status'], {
    env: { HITHINK_FINANCE_API_KEY: randomUUID() },
    failure: true,
  });
  assert.equal(disconnected.code, 3);
  assert.equal(JSON.parse(disconnected.stdout).data.connected, false);
  const state = JSON.parse(
    await readFile(path.join(home, '.hithink-finance/auth/production/auth.json'), 'utf8'),
  );
  assert.equal(state.initialized, true);
  assert.deepEqual(state.credentials, {});
  console.log(
    JSON.stringify({
      package: packed.filename,
      copies: 2,
      missing_native_module: true,
      shared_credentials: true,
      explicit_key_without_home: true,
      logout_persistent: true,
    }),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (
    path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('finance-package-')
  )
    throw Error('Unexpected package verification temporary directory.');
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
