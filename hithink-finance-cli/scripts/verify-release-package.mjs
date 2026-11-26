import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseReceiptFile } from './validate-release.mjs';

const run = promisify(execFile);
assert(process.env.npm_execpath, 'Run through npm run verify:release-package.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const destination = process.argv[2]
  ? path.resolve(process.argv[2])
  : await mkdtemp(path.join(os.tmpdir(), 'finance-release-'));
await mkdir(destination, { recursive: true });
assert.equal((await readdir(destination)).length, 0, 'Choose an empty package output directory.');
const env = {
  ...process.env,
  NODE_OPTIONS: '',
  NODE_DEBUG: '',
  npm_config_update_notifier: 'false',
};
async function npm(args) {
  return run(process.execPath, [process.env.npm_execpath, ...args], {
    env,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
const [packed] = JSON.parse(
  (await npm(['pack', '--json', '--ignore-scripts', '--pack-destination', destination])).stdout,
);
assert.equal(packed.name, pkg.name);
assert.equal(packed.version, pkg.version);
const files = new Set(packed.files.map((file) => file.path));
for (const name of ['dist/cli/main.js', 'npm-shrinkwrap.json', 'skills/manifest.json', 'LICENSE'])
  assert(files.has(name), name);
assert(
  ![...files].some((name) => /(^|\/)(tests|src|sdd-docs|python)(\/|$)|\.env|\.map$/u.test(name)),
  'Unexpected development/private files in tarball.',
);
const tarball = path.join(destination, packed.filename);
const smokeRoot = await mkdtemp(path.join(os.tmpdir(), 'finance-release-smoke-'));
try {
  const prefix = path.join(smokeRoot, 'installed');
  await npm([
    'install',
    '--prefix',
    prefix,
    '--prefer-offline',
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    tarball,
  ]);
  const installed = path.join(prefix, 'node_modules', pkg.name);
  const home = path.join(smokeRoot, 'user');
  await mkdir(home);
  const adapter = path.join(smokeRoot, 'home.mjs');
  await writeFile(
    adapter,
    `import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
const original = os.userInfo;
os.userInfo = (...args) => ({ ...original(...args), homedir: process.env.RELEASE_SMOKE_HOME });
os.homedir = () => process.env.RELEASE_SMOKE_HOME;
syncBuiltinESMExports();\n`,
  );
  const smokeEnv = { ...env };
  for (const name of Object.keys(smokeEnv))
    if (name.startsWith('HITHINK_FINANCE_') || ['API_KEY', 'FUYAO_TOKEN'].includes(name))
      delete smokeEnv[name];
  Object.assign(smokeEnv, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'config'),
    LOCALAPPDATA: path.join(home, 'local'),
    XDG_CONFIG_HOME: path.join(home, 'config'),
    XDG_DATA_HOME: path.join(home, 'data'),
    XDG_STATE_HOME: path.join(home, 'state'),
    RELEASE_SMOKE_HOME: home,
    DISABLE_TELEMETRY: '1',
    HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
    HITHINK_FINANCE_NO_SKILL_UPDATE: '1',
    HITHINK_FINANCE_NO_WORKER: '1',
  });
  const main = path.join(installed, 'dist/cli/main.js');
  async function cli(args, expectedExit = 0) {
    try {
      const result = await run(
        process.execPath,
        ['--import', pathToFileURL(adapter).href, main, ...args],
        {
          env: smokeEnv,
          cwd: smokeRoot,
          windowsHide: true,
          timeout: 20000,
        },
      );
      assert.equal(expectedExit, 0);
      return result.stdout;
    } catch (error) {
      if (expectedExit !== 0 && error.code === expectedExit) return error.stdout;
      throw error;
    }
  }
  assert.equal((await cli(['--version'])).trim(), pkg.version);
  assert.equal(JSON.parse(await cli(['capabilities', '--format', 'json'])).ok, true);
  const status = JSON.parse(await cli(['auth', 'status', '--format', 'json'], 3));
  assert.equal(status.data.connected, false);
  const doctor = JSON.parse(await cli(['doctor', '--format', 'json']));
  assert.equal(doctor.ok, true);
  assert.equal(doctor.data.duckdb.available, true);
  assert.equal(doctor.data.authentication.configured, false);
  const skills = path.join(installed, 'skills');
  const manifest = JSON.parse(await readFile(path.join(skills, 'manifest.json'), 'utf8'));
  assert.equal(manifest.cliVersion, pkg.version);
  for (const [name, digest] of Object.entries(manifest.files)) {
    const file = path.resolve(skills, name);
    assert(file.startsWith(skills + path.sep));
    assert.equal(
      createHash('sha256')
        .update((await readFile(file, 'utf8')).replaceAll('\r\n', '\n'))
        .digest('hex'),
      digest,
      name,
    );
  }
  assert.equal(
    'sha512-' +
      createHash('sha512')
        .update(await readFile(tarball))
        .digest('base64'),
    packed.integrity,
    'Tarball changed after installation smoke.',
  );
  const receipt = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    filename: packed.filename,
    name: packed.name,
    version: packed.version,
    integrity: packed.integrity,
    installedSmoke: 'passed',
  };
  await writeFile(path.join(destination, releaseReceiptFile), JSON.stringify(receipt) + '\n', {
    flag: 'wx',
  });
  console.log(JSON.stringify({ ...receipt, tarball }));
  if (process.env.GITHUB_OUTPUT) {
    assert(!/[\r\n]/u.test(tarball));
    await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
  }
} finally {
  assert.equal(path.dirname(path.resolve(smokeRoot)), path.resolve(os.tmpdir()));
  await rm(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
