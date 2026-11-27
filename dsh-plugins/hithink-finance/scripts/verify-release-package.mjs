import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { writeReleaseReceipt } from '../../../hithink-finance-cli/scripts/validate-release.mjs';

const exec = promisify(execFile);
assert(process.env.npm_execpath, 'Run through npm run verify:release-package.');
assert(process.argv[2], 'Pass a new, empty release output directory.');
const destination = path.resolve(process.argv[2]);
await mkdir(destination, { recursive: true });
assert.equal((await readdir(destination)).length, 0, 'Choose an empty package output directory.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const required = [
  'LICENSE', 'README.md', 'package.json', 'assets/icon.png', 'cordis.patch.yml', 'dist/client.js',
  'locale/en.json', 'locale/zh.json', 'locale/detail.en.md', 'locale/detail.zh.md',
  'src/host/index.js', 'src/host/data-cli-process.js', 'src/host/data-management.js',
  'src/host/data-remote.js', 'src/presentation/index.js',
  'skills/hithink-finance-dsh/SKILL.md',
  'skills/hithink-finance-dsh/references/workbench.md',
  'skills/hithink-finance-dsh/references/custom-holdings.md',
  'dist/third-party/echarts/LICENSE', 'dist/third-party/echarts/NOTICE',
  'dist/third-party/zrender/LICENSE',
  'dist/third-party/tslib/LICENSE.txt', 'dist/third-party/tslib/CopyrightNotice.txt',
  'dist/third-party/lightweight-charts/LICENSE', 'dist/third-party/lightweight-charts/NOTICE',
  'dist/third-party/fancy-canvas/LICENSE',
  'dist/third-party/matter-js/LICENSE',
];
const publicTrees = [
  /^dist\/workbench-samples\/\d{2}-[a-z0-9-]+\.html$/u,
  /^locale\/(?:[a-z]+\.json|detail\.[a-z]+\.md)$/u,
  /^skills\/hithink-finance-dsh\/references\/[a-z-]+\.md$/u,
  /^src\/(?:host|presentation)\/[a-z-]+\.m?js$/u,
];

function npm(args) {
  return exec(process.execPath, [process.env.npm_execpath, ...args], {
    env: { ...process.env, NODE_OPTIONS: '', npm_config_update_notifier: 'false' },
    windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
  });
}

async function checkHost(prefix) {
  const resolve = createRequire(path.join(prefix, 'verify.cjs')).resolve;
  const manifestPath = resolve(`${pkg.name}/package.json`);
  const installed = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(installed.name, pkg.name);
  assert.equal(installed.version, pkg.version);
  assert.equal(installed.license, 'MIT');
  const directory = path.dirname(manifestPath);
  await Promise.all(required.map((name) => access(path.join(directory, name))));
  assert.match(await readFile(path.join(directory, 'LICENSE'), 'utf8'), /MIT License/u);
  await exec(process.execPath, ['--check', resolve(`${pkg.name}/client`)], { windowsHide: true });

  const main = resolve(pkg.name);
  const { apply } = await import(pathToFileURL(main));
  const { workbenchTemplates, getTemplateSample } = await import(
    pathToFileURL(path.join(path.dirname(main), 'workbench-templates.js'))
  );
  const samples = workbenchTemplates.filter(({ dataMode }) => dataMode === 'sample');
  assert.equal(samples.length, 33);
  for (const { id } of samples) assert.match(await getTemplateSample(id), /<html\b/iu, id);

  const tools = new Set();
  const skills = new Set();
  const services = [];
  const disposers = [];
  try {
    await apply({
      tools: { register: (tool) => tools.add(tool.name) },
      skills: { register: (skill) => skills.add(skill.name) },
      get: () => undefined,
      effect: (callback) => disposers.push(callback()),
      inject: (_names, callback) => callback({
        shellEnv: { register() {} },
        typert: { register: ({ invocations }) => assert(invocations.length > 0) },
        plugin: (service) => services.push(service),
      }),
    });
    assert.deepEqual([...tools].sort(), ['hithink_finance_render', 'hithink_finance_workbench_import']);
    for (const skill of ['hithink-finance-dsh', 'hithink-finance-market']) assert(skills.has(skill));
    assert.equal(services.length, 3);
  } finally {
    for (const dispose of disposers.reverse()) await dispose();
  }
}

const [packed] = JSON.parse((await npm(['pack', '--json', '--pack-destination', destination])).stdout);
assert.equal(packed.name, pkg.name);
assert.equal(packed.version, pkg.version);
const files = new Set(packed.files.map((file) => file.path));
for (const file of files) {
  assert(
    required.includes(file) || publicTrees.some((pattern) => pattern.test(file)),
    `Unexpected file in plugin tarball: ${file}`,
  );
}
for (const name of required) assert(files.has(name), `Missing plugin file: ${name}`);
const smokeRoot = await mkdtemp(path.join(tmpdir(), 'dsh-finance-release-smoke-'));
try {
  await npm([
    'install', '--prefix', smokeRoot, '--prefer-offline', '--ignore-scripts', '--omit=dev',
    '--no-audit', '--no-fund', path.join(destination, packed.filename),
  ]);
  await checkHost(smokeRoot);
  console.log(JSON.stringify(writeReleaseReceipt(destination, packed)));
} finally {
  assert.equal(path.dirname(smokeRoot), path.resolve(tmpdir()));
  await rm(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
