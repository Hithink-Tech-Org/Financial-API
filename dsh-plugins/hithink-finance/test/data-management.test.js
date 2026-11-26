import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCliRunner } from '../src/host/cli.js';
import { createDataManagement } from '../src/host/data-management.js';

function envelope(command, data) {
  return { exitCode: 0, stdout: JSON.stringify({ ok: true, command, data }), stderr: '' };
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-finance-data-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return realpath(directory);
}

test('missing CLI database is inspected without creation and manual sync records survive restart', async (t) => {
  const home = await fixture(t);
  const database = join(home, 'existing.duckdb');
  let latest = '2026-11-24';
  const calls = [];
  const cli = { async run(args, options) {
    calls.push(args);
    if (args[0] === 'config') return envelope('config.show', { db_path: database });
    assert.equal(args[1], database);
    if (args[2] === 'db') return envelope('db.query', [{ latest_date: latest }]);
    assert.equal(options.maintenance, true);
    if (args[3] === 'init') {
      await writeFile(database, '');
      return envelope('data.init', { initialized: true });
    }
    latest = '2026-11-25';
    return envelope('data.sync', { quality: { ok: true, issues: [] } });
  } };
  const setup = { cli, userHome: home, signal: new AbortController().signal };
  const data = createDataManagement(setup);
  assert.equal((await data.status()).databaseState, 'uninitialized');
  assert.deepEqual(calls, [['config', 'show']]);
  assert.equal(await data.start('init'), true);
  await data.close();
  assert.equal((await data.status()).latestDate, '2026-11-24');
  assert.equal(await data.start('sync'), true);
  await data.close();
  const restarted = await createDataManagement(setup).status();
  assert.equal(restarted.latestDate, '2026-11-25');
  assert.equal(restarted.running, null);
  assert.equal(restarted.lastSync.trigger, 'manual');
  assert.equal(restarted.lastSuccessfulSync.ok, true);
});

test('two hosts share the schedule, run only one job per Shanghai slot and do not replay missed slots', async (t) => {
  const home = await fixture(t);
  const database = join(home, 'existing.duckdb');
  await writeFile(database, '');
  let timestamp = Date.parse('2026-11-26T07:59:59+08:00');
  let count = 0;
  const result = Promise.withResolvers();
  const cli = { async run(args) {
    if (args[0] === 'config') return envelope('config.show', { db_path: database });
    if (args[2] === 'db') return envelope('db.query', [{ latest_date: '2026-11-25' }]);
    count += 1;
    return result.promise;
  } };
  const setup = { cli, userHome: home, now: () => timestamp, signal: new AbortController().signal };
  const web = createDataManagement(setup);
  const desktop = createDataManagement(setup);
  await web.configure({ enabled: true, time: '08:00' });
  await Promise.all([web.tick(), desktop.tick()]);
  assert.equal(count, 0);
  timestamp += 1_000;
  await Promise.all([web.tick(), desktop.tick()]);
  assert.equal(count, 1);
  assert.equal((await desktop.status()).running, 'sync');
  await assert.rejects(() => desktop.start('sync'), { code: 'FINANCE_DATA_BUSY' });
  result.resolve(envelope('data.sync', { quality: { ok: false, issues: [{ count: 1 }] } }));
  await Promise.all([desktop.close(), web.close()]);
  const afterSync = await desktop.status();
  assert.equal(afterSync.lastSync.trigger, 'scheduled');
  assert.deepEqual(afterSync.lastSync.quality, { passed: false, issues: 1 });
  assert.equal(afterSync.lastSuccessfulSync, null);
  await createDataManagement(setup).tick();
  timestamp = Date.parse('2026-11-27T08:01:00+08:00');
  await desktop.tick();
  assert.equal(count, 1);
});

test('managed CLI receives cancellation via IPC and completes its cleanup', async (t) => {
  const directory = await fixture(t);
  const runtime = join(directory, 'dist', 'cli');
  const receipt = join(directory, 'cleanup.txt');
  await mkdir(runtime, { recursive: true });
  await writeFile(join(runtime, 'run.js'), `
    import { writeFile } from 'node:fs/promises';
    export async function executeCommand(argv, { signal }) {
      const wait = signal.aborted ? Promise.resolve() : new Promise((done) =>
        signal.addEventListener('abort', done, { once: true }));
      console.log('started');
      await wait;
      await writeFile(argv[0], 'complete');
      return 143;
    }
  `);
  const cancellation = new AbortController();
  const cli = createCliRunner({ resolvePackage: () => ({ directory }) });
  await assert.rejects(() => cli.run([receipt, 'data', 'sync'], {
    signal: cancellation.signal, maintenance: true, onLine: () => cancellation.abort(),
  }), { code: 'FINANCE_CANCELLED' });
  const { readFile } = await import('node:fs/promises');
  assert.equal(await readFile(receipt, 'utf8'), 'complete');
});

test('shutdown drains a still-claiming data action before it can leave a reservation', async (t) => {
  const home = await fixture(t);
  const cancellation = new AbortController();
  const pendingConfig = Promise.withResolvers();
  const reading = Promise.withResolvers();
  const data = createDataManagement({ userHome: home, signal: cancellation.signal, cli: { run(args) {
    assert.deepEqual(args, ['config', 'show']);
    reading.resolve();
    return pendingConfig.promise;
  } } });
  const starting = data.start('init');
  const rejected = assert.rejects(starting, { name: 'AbortError' });
  await reading.promise;
  cancellation.abort();
  let closed = false;
  const closing = data.close().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  pendingConfig.resolve(envelope('config.show', { db_path: join(home, 'new.duckdb') }));
  await Promise.all([rejected, closing]);
});

test('manual maintenance rejects a different CLI database from the displayed path', async (t) => {
  const home = await fixture(t);
  let configured = join(home, 'original.duckdb');
  const cli = { async run(args) {
    assert.deepEqual(args, ['config', 'show']);
    return envelope('config.show', { db_path: configured });
  } };
  const data = createDataManagement({ cli, userHome: home, signal: new AbortController().signal });
  const displayed = (await data.status()).databasePath;
  configured = join(home, 'other.duckdb');
  await assert.rejects(data.start('init', displayed), { code: 'FINANCE_DATA_PATH_CHANGED' });
});
