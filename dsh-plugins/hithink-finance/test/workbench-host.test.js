import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, link, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import { mountFinanceBridge } from '../src/host/index.js';
import { createWorkbench, workbenchImportTool } from '../src/host/workbench.js';
import { getTemplateHtml, getTemplateSample, workbenchTemplates } from '../src/host/workbench-templates.js';

const plain = '<main><h1>交易笔记</h1></main>';
const manifest = (queries) => `${plain}<script type="application/json" id="hithink-finance-data">${JSON.stringify({ version: 1, queries })}</script>`;
const quote = { command: 'market.snapshot', source: 'remote', params: { thscodes: '000001.SZ' }, inputs: ['thscodes'] };
const history = { command: 'market.history', source: 'auto', sources: ['auto', 'remote'],
  params: { thscode: '000001.SZ', 'start-ms': 1794787200000, 'end-ms': 1794873600000 } };

function output(command, data, meta = {}, exitCode = 0) {
  return { exitCode, stdout: JSON.stringify({ ok: true, command, data, meta }), stderr: '' };
}

const schemas = {
  'market.snapshot': [{ flags: '--thscodes <codes>', type: 'string' }],
  'market.history': [{ flags: '--thscode <code>', required: true, type: 'string' },
    { flags: '--start-ms <ms>', type: 'integer', required: true }, { flags: '--end-ms <ms>', type: 'integer', required: true },
    { flags: '--adjust <mode>', choices: ['none', 'forward', 'backward'] }],
  'market.adjustment-factors': [{ flags: '--thscode <code>', required: true }, { flags: '--start <date>' }, { flags: '--end <date>' }],
};

async function setup(t, runner) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finance-workbench-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const userHome = join(root, 'user');
  await mkdir(userHome);
  const calls = [];
  const cli = { async run(argv, ...options) {
    calls.push(argv);
    if (argv[0] === 'schema') return output('schema', { id: argv[1], command: argv[1].split('.'), options: schemas[argv[1]] });
    if (argv[0] === 'auth') return output('auth.status', { connected: true });
    return runner(argv, ...options);
  } };
  const args = { profileDirectory: join(root, 'profile'), userHome, signal: t.signal, cli };
  return { root, args, workbench: createWorkbench(args), calls };
}

test('saved pages survive a host restart and competing mutations cannot reuse retired revisions', async (t) => {
  const { args, workbench } = await setup(t);
  const first = (await workbench.create({ title: '测试', html: plain })).data;
  const anotherHost = createWorkbench(args);
  assert.deepEqual((await anotherHost.get(first.id)).data, first);
  const [a, b] = await Promise.all([workbench, anotherHost].map((service, index) => service.update({
    id: first.id, revision: 1, title: `更新 ${index}`, html: `<main>${index}</main>`,
  })));
  const changes = [a, b];
  assert.equal(changes.filter((entry) => entry.ok).length, 1);
  assert.equal(changes.find((entry) => !entry.ok).error.code, 'FINANCE_WORKBENCH_CONFLICT');
  const update = { id: first.id, revision: 2, title: '末版', html: plain };
  assert.equal((await anotherHost.update(update)).data.revision, 3);
  assert.equal((await workbench.deletePage({ id: first.id, revision: 3 })).error.code, 'FINANCE_WORKBENCH_CONFIRM_REQUIRED');
  assert.equal((await anotherHost.update({ ...update, revision: 1 })).error.code, 'FINANCE_WORKBENCH_CONFLICT');
  assert.equal((await anotherHost.list()).data[0].html, undefined);
  assert.deepEqual(await workbench.deletePage({ id: first.id, revision: 3, confirm: true }), { ok: true, data: { id: first.id } });
  assert.deepEqual((await anotherHost.list()).data, []);
  assert.equal((await anotherHost.get(first.id)).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  assert.equal((await anotherHost.get('../outside')).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  const { data: { directory } } = await workbench.storage();
  const files = await readdir(join(directory, `dashboard-${first.id}`));
  assert.ok(files.every((name) => name.endsWith('.json')), 'deleted pages retain no HTML blobs');
});

test('one user shares its configured active library across profiles and restarts', async (t) => {
  const { root, args, workbench } = await setup(t);
  const other = createWorkbench({ ...args, profileDirectory: join(root, 'other-profile') });
  const defaultDirectory = join(args.userHome, 'hithink-finance', 'dashboards');
  const selected = join(root, '我的看板');
  assert.deepEqual((await workbench.storage()).data, { directory: defaultDirectory, defaultDirectory });
  const { data: first } = await workbench.create({ title: '默认目录看板', html: plain });
  assert.deepEqual((await other.get(first.id)).data, first);
  const previous = join(defaultDirectory, `dashboard-${first.id}`);
  const html = (await readdir(previous)).find((name) => name.endsWith('.html'));
  assert.equal(await readFile(join(previous, html), 'utf8'), plain);

  assert.deepEqual((await workbench.setStorage({ directory: selected })).data, {
    directory: selected, defaultDirectory, previousDirectory: defaultDirectory, copied: 0, skipped: 0, count: 0,
  });
  const restarted = createWorkbench(args);
  assert.deepEqual((await restarted.storage()).data, { directory: selected, defaultDirectory });
  assert.deepEqual((await other.list()).data, []);
  assert.equal((await workbench.get(first.id)).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  const { data: second } = await other.create({ title: '自选目录看板', html: plain });
  assert.deepEqual((await restarted.get(second.id)).data, second);
  assert.equal(await readFile(join(previous, html), 'utf8'), plain);

  await writeFile(join(root, 'file.txt'), 'keep');
  assert.equal((await other.setStorage({ directory: 'relative' })).error.code, 'FINANCE_WORKBENCH_INVALID_DIRECTORY');
  assert.equal((await other.setStorage({ directory: join(root, 'file.txt') })).error.code, 'FINANCE_WORKBENCH_DIRECTORY_UNAVAILABLE');
  assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'keep');
  assert.equal((await other.storage()).data.directory, selected);
  const temporary = join(root, 'moved-library');
  await rename(selected, temporary);
  assert.equal((await other.list()).error.code, 'FINANCE_WORKBENCH_DIRECTORY_UNAVAILABLE');
  assert.equal((await other.storage()).data.directory, selected);
  assert.equal((await other.setStorage({ directory: null })).data.directory, defaultDirectory);
  assert.deepEqual((await workbench.get(first.id)).data, first);
  await rename(temporary, selected);
  assert.equal((await restarted.setStorage({ directory: selected })).ok, true);
  assert.deepEqual((await restarted.get(second.id)).data, second);
});

test('migrating merges live boards, preserves metadata and counts identical copies on retry', async (t) => {
  const { root, workbench } = await setup(t);
  const target = join(root, 'target-library');
  await workbench.setStorage({ directory: target });
  const { data: unrelated } = await workbench.create({ title: '目标目录的其他看板', html: plain });
  await writeFile(join(target, 'unmanaged.html'), '用户文件');
  await workbench.setStorage({ directory: null });
  const { data: first } = await workbench.create({ title: '现有看板', html: plain });
  const document = manifest({ quote });
  const { data: original } = await workbench.update({
    id: first.id, revision: first.revision, expectedDirectory: first.directory, title: '含数据绑定的看板', html: document,
  });
  const { data: deleted } = await workbench.create({ title: '已删除', html: plain });
  await workbench.deletePage({ id: deleted.id, revision: deleted.revision, confirm: true });

  const firstSwitch = await workbench.setStorage({ directory: target, expectedDirectory: original.directory, migrateExisting: true });
  assert.deepEqual(firstSwitch.data, {
    directory: target, defaultDirectory: original.directory, previousDirectory: original.directory, copied: 1, skipped: 0, count: 1,
  });
  const { data: migrated } = await workbench.get(original.id, target);
  assert.deepEqual({ ...migrated, directory: original.directory, file: original.file }, original);
  assert.equal(await readFile(migrated.file, 'utf8'), document);
  assert.equal(await readFile(original.file, 'utf8'), document);
  assert.deepEqual((await workbench.get(unrelated.id, target)).data, unrelated);
  assert.equal((await workbench.get(deleted.id)).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  assert.equal(await readFile(join(target, 'unmanaged.html'), 'utf8'), '用户文件');

  await workbench.setStorage({ directory: null, expectedDirectory: target });
  const repeated = await workbench.setStorage({ directory: target, expectedDirectory: original.directory, migrateExisting: true });
  assert.equal(repeated.data.copied, 0);
  assert.equal(repeated.data.skipped, 1);
  assert.equal(repeated.data.count, 1);
  assert.equal((await workbench.get(original.id)).data.file, migrated.file);
  const restored = await workbench.setStorage({ directory: null, expectedDirectory: target, migrateExisting: true });
  assert.equal(restored.data.directory, original.directory);
  assert.equal(restored.data.copied, 1);
  assert.equal(restored.data.skipped, 1);
  assert.equal(restored.data.count, 2);
});

test('target content, revision, or tombstone conflicts abort before copying any other board', async (t) => {
  const { root, workbench } = await setup(t);
  const { data: original } = await workbench.create({ title: '冲突看板', html: plain });
  const { data: candidate } = await workbench.create({ title: '另一看板', html: plain });
  for (const name of ['same-revision', 'updated', 'deleted']) {
    const target = join(root, name);
    await mkdir(target);
    const folderName = `dashboard-${original.id}`;
    await cp(join(original.directory, folderName), join(target, folderName), { recursive: true });
    await workbench.setStorage({ directory: target });
    if (name === 'same-revision') {
      const { data: replica } = await workbench.get(original.id);
      await writeFile(replica.file, '<main>同版本但不同内容</main>');
    } else {
      const changed = name === 'deleted'
        ? await workbench.deletePage({ id: original.id, revision: original.revision, confirm: true })
        : await workbench.update({ id: original.id, revision: original.revision, title: original.title, html: '<main>目标新版本</main>' });
      assert.equal(changed.ok, true);
    }
    await workbench.setStorage({ directory: null });
    const failed = await workbench.setStorage({ directory: target, expectedDirectory: original.directory, migrateExisting: true });
    assert.equal(failed.error.code, 'FINANCE_WORKBENCH_MIGRATION_CONFLICT');
    assert.ok(failed.error.message.includes(original.title));
    assert.deepEqual(await readdir(target), [folderName]);
    assert.equal((await workbench.storage()).data.directory, original.directory);
    assert.deepEqual((await workbench.get(candidate.id)).data, candidate);
    assert.equal(await readFile(original.file, 'utf8'), plain);
  }
});

test('other hosts complete current writes before a migration and reject stale concurrent switches', async (t) => {
  const { root, args, workbench } = await setup(t);
  const { data: old } = await workbench.create({ title: '在途写入', html: plain });
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const writer = createWorkbench({ ...args, cli: { async run(argv, ...options) {
    if (argv[0] === 'schema') {
      started.resolve();
      await release.promise;
    }
    return args.cli.run(argv, ...options);
  } } });
  const html = manifest({ quote });
  const pendingWrite = writer.update({
    id: old.id, revision: old.revision, expectedDirectory: old.directory, title: old.title, html,
  });
  await started.promise;
  const target = join(root, 'switch');
  const pendingMigration = workbench.setStorage({ directory: target, expectedDirectory: old.directory, migrateExisting: true });
  await wait(65);
  release.resolve();
  assert.equal((await pendingWrite).data.revision, 2);
  const migrated = await pendingMigration;
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(migrated.data.copied, 1);
  assert.equal((await workbench.get(old.id)).data.html, html);
  assert.equal((await workbench.get(old.id)).data.revision, 2);
  const switches = await Promise.all([workbench, writer].map((host, index) =>
    host.setStorage({ directory: join(root, `parallel-${index}`), expectedDirectory: target })));
  assert.equal(switches.filter((result) => result.ok).length, 1);
  assert.equal(switches.find((result) => !result.ok).error.code, 'FINANCE_WORKBENCH_DIRECTORY_CHANGED');
});

test('migration retries when a separate writer process exits with the lock held', { timeout: 8_000 }, async (t) => {
  const { root, args, workbench } = await setup(t);
  const { data: old } = await workbench.create({ title: '等待另一个进程', html: plain });
  const code = `
    import { createWorkbench } from ${JSON.stringify(new URL('../src/host/workbench.js', import.meta.url).href)};
    const [userHome, input] = process.argv.slice(1);
    const cli = { run() {
      process.stdout.write('locked');
      return new Promise(() => {});
    } };
    process.stdin.resume();
    const workbench = createWorkbench({ userHome, signal: new AbortController().signal, cli });
    await workbench.update(JSON.parse(input));
  `;
  const input = { id: old.id, revision: old.revision, expectedDirectory: old.directory, title: old.title, html: manifest({ quote }) };
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, args.userHome, JSON.stringify(input)], { windowsHide: true });
  t.after(() => child.kill());
  const closed = once(child, 'close');
  const [marker] = await Promise.race([
    once(child.stdout, 'data'),
    closed.then(() => assert.fail('The fixture writer exited before acquiring its lock')),
  ]);
  assert.equal(String(marker), 'locked');
  const target = join(root, 'recovered');
  const pendingMigration = workbench.setStorage({ directory: target, expectedDirectory: old.directory, migrateExisting: true });
  await wait(65);
  assert.equal((await workbench.storage()).data.directory, old.directory);
  child.kill();
  await closed;
  const migrated = await pendingMigration;
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(migrated.data.copied, 1);
  assert.equal((await workbench.get(old.id, target)).data.revision, 1);
  assert.equal(await readFile(old.file, 'utf8'), plain);
});

test('stale directory receipts cannot read or mutate the same ID and revision in another library', async (t) => {
  const { root, args, workbench } = await setup(t);
  const html = `<main>${'a'.repeat(8_100)}</main>`;
  const { data: old } = await workbench.create({ title: '原看板', html });
  const { id, revision, directory: expectedDirectory } = old;
  const tool = workbenchImportTool(workbench, () => ({ workspaceRoot: root }));
  const ctx = { signal: t.signal, agent: { session: { header: { cwd: root } } } };
  const list = await tool.execute({ action: 'list', search: old.title }, ctx);
  assert.equal(list.data.directory, expectedDirectory);
  assert.equal((await workbench.list()).data[0].directory, expectedDirectory);
  const original = await tool.execute({ action: 'get', id, expectedDirectory }, ctx);
  const destination = join(root, 'backup');
  await cp(old.directory, destination, { recursive: true, force: false, errorOnExist: true });
  const other = createWorkbench(args);
  assert.equal((await other.setStorage({ directory: destination })).ok, true);
  const replica = (await other.get(id)).data;
  assert.equal(replica.revision, revision);
  assert.equal(replica.directory, destination);
  await writeFile(replica.file, '<main>原版本的离线副本</main>');
  const candidate = { id, revision, expectedDirectory, title: '误更新', html: plain };
  await writeFile(join(root, 'updated.html'), plain);
  const expectedError = 'FINANCE_WORKBENCH_DIRECTORY_CHANGED';
  assert.equal((await workbench.get(id, expectedDirectory)).error.code, expectedError);
  assert.equal((await workbench.update(candidate)).error.code, expectedError);
  assert.equal((await workbench.deletePage({ id, revision, expectedDirectory, confirm: true })).error.code, expectedError);
  assert.equal((await tool.execute({ id, revision, expectedDirectory, title: candidate.title, file: 'updated.html' }, ctx)).error.code, expectedError);
  assert.equal((await tool.execute({ action: 'get', id, revision, expectedDirectory, offset: original.data.nextOffset }, ctx)).error.code,
    expectedError);
  assert.equal((await other.get(id)).data.revision, revision);
  assert.equal(await readFile(replica.file, 'utf8'), '<main>原版本的离线副本</main>');
  assert.equal(await readFile(old.file, 'utf8'), html);
  assert.equal((await other.setStorage({ directory: null })).ok, true);
  assert.deepEqual((await workbench.get(id)).data, old);
});

test('legacy profile migration preserves IDs, revisions, deletions and original files once', async (t) => {
  const { root, args, workbench } = await setup(t);
  const legacy = join(args.profileDirectory, 'hithink-finance', 'workbench');
  const id = randomUUID();
  const deletedId = randomUUID();
  const blob = randomUUID();
  const page = { id, revision: 6, title: '旧看板', html: plain, queries: [],
    createdAt: '2026-11-22T01:00:00Z', updatedAt: '2026-11-24T01:00:00Z', templateId: 'template:stock-overview' };
  await mkdir(join(legacy, id), { recursive: true });
  await mkdir(join(legacy, deletedId));
  await writeFile(join(legacy, id, '6.json'), blob);
  await writeFile(join(legacy, id, `${blob}.page`), JSON.stringify(page));
  await writeFile(join(legacy, deletedId, '4.json'), '-');

  const another = createWorkbench(args);
  const [left, right] = await Promise.all([workbench.get(id), another.get(id)]);
  const { directory, file, ...migrated } = left.data;
  assert.deepEqual(migrated, page);
  assert.equal(await readFile(file, 'utf8'), plain);
  assert.deepEqual(right, left);
  assert.equal(await readFile(join(directory, `dashboard-${deletedId}`, '4.json'), 'utf8'), '-');
  assert.equal((await workbench.get(deletedId)).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  assert.equal((await workbench.deletePage({ id, revision: 6, confirm: true })).ok, true);
  assert.equal(await readFile(join(legacy, id, `${blob}.page`), 'utf8'), JSON.stringify(page));

  const restarted = createWorkbench(args);
  assert.deepEqual((await restarted.list()).data, []);
  await another.setStorage({ directory: join(root, 'empty') });
  assert.deepEqual((await createWorkbench(args).list()).data, []);
  await restarted.setStorage({ directory: null });
  assert.equal((await restarted.get(id)).error.code, 'FINANCE_WORKBENCH_NOT_FOUND');
  assert.equal(await readFile(join(directory, `dashboard-${id}`, '7.json'), 'utf8'), '-');
});

test('saved HTML reads reject hard links and deletion leaves the linked source intact', async (t) => {
  const { root, workbench } = await setup(t);
  const { data: { directory } } = await workbench.storage();
  const { data: { id } } = await workbench.create({ title: '看板', html: plain });
  const board = join(directory, `dashboard-${id}`);
  const filename = (await readdir(board)).find((entry) => entry.endsWith('.html'));
  const document = join(board, filename);
  const external = join(root, 'external.html');
  await rename(document, external);
  await link(external, document);
  assert.equal((await workbench.get(id)).error.code, 'FINANCE_WORKBENCH_STORAGE_ERROR');
  assert.equal((await workbench.deletePage({ id, revision: 1, confirm: true })).ok, true);
  assert.equal(await readFile(external, 'utf8'), plain);
});

test('query scope, argument bounds, CLI contract and concurrency reject unrelated execution', async (t) => {
  const available = Promise.withResolvers();
  const started = Promise.withResolvers();
  const { workbench, calls } = await setup(t, async () => {
    started.resolve();
    await available.promise;
    return output('market.snapshot', { item: [{ thscode: '000001.SZ', last_price: 10 }] }, { source: 'remote', request_id: 'req_01', ignored: 'internal' });
  });
  for (const input of [
    { command: 'auth.logout' }, { ...quote, source: 'local' }, { ...quote, inputs: ['output'] }, { ...quote, params: { db: 'secret' } },
    { ...history, params: { ...history.params, adjust: 'undefined_mode' } },
    { ...history, source: 'local' },
  ]) assert.equal((await workbench.create({ title: '错误查询', html: manifest({ input }) })).ok, false);

  const { data: page } = await workbench.create({ title: '行情', html: manifest({ quote }) });
  const query = { pageId: page.id, revision: page.revision, name: 'quote' };
  for (const extra of [{ name: 'auth' }, { params: { output: 'file' } }, { params: { thscodes: '--api-key' } },
    { revision: 7 }, { source: 'local' }]) {
    assert.equal((await workbench.query({ ...query, ...extra })).ok, false);
  }
  const results = Promise.all([workbench.query(query), workbench.query(query)]);
  await started.promise;
  await wait(60);
  available.resolve();
  const [first, second] = await results;
  assert.deepEqual(first, second);
  assert.equal(first.data.item[0].last_price, 10);
  assert.equal(first.meta.source, 'remote');
  assert.equal(first.meta.requestId, 'req_01');
  assert.equal(first.meta.ignored, undefined);
  assert.equal(calls.filter(([first, second]) => first === 'schema' && second === 'market.snapshot').length, 1);
  assert.equal(calls.filter(([first]) => first === 'auth').length, 1);
  assert.deepEqual(calls.filter(([first]) => first === '--source'), [
    ['--source', 'remote', 'market', 'snapshot', '--thscodes', '000001.SZ'],
  ]);
});

test('local data absence is checked before CLI invocation and does not trigger remote authentication', async (t) => {
  const { workbench, calls } = await setup(t, (argv) => {
    assert.deepEqual(argv, ['config', 'show']);
    return output('config.show', { db_path: join(tmpdir(), 'does-not-exist-hithink-finance.duckdb') });
  });
  const factors = { command: 'market.adjustment-factors', source: 'local', params: {
    thscode: '000001.SZ', start: '2026-01-10', end: '2026-02-10',
  } };
  const { data: page } = await workbench.create({ title: '因子', html: manifest({ factors }) });
  const result = await workbench.query({ pageId: page.id, revision: 1, name: 'factors' });
  assert.equal(result.error.code, 'FINANCE_WORKBENCH_LOCAL_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('duckdb'), false);
  assert.deepEqual(calls.map(([command]) => command), ['schema', 'config']);
});

test('private CLI failures and verified source mismatch render safe errors', async (t) => {
  let succeed = false;
  const { workbench } = await setup(t, () => succeed
    ? output('market.history', [], { source: 'local' })
    : { exitCode: 1, stdout: '', stderr: JSON.stringify({ ok: false, command: 'market.history',
      error: { code: 'UPSTREAM_NETWORK_FAILURE', message: 'user credential', request_id: 'safe-request' } }) });
  const { data: page } = await workbench.create({ title: '历史', html: manifest({ history }) });
  const query = { pageId: page.id, revision: 1, name: 'history', source: 'remote' };
  const failed = await workbench.query(query);
  assert.equal(failed.error.code, 'UPSTREAM_NETWORK_FAILURE');
  assert.equal(failed.error.requestId, 'safe-request');
  assert.equal(JSON.stringify(failed).includes('user credential'), false);
  succeed = true;
  assert.equal((await workbench.query(query)).error.code, 'FINANCE_WORKBENCH_SOURCE_MISMATCH');
  assert.equal((await workbench.query({ ...query, source: 'auto' })).meta.source, 'local');
});

test('tool saves workspace files and finds or revises the same dashboard from a different session', async (t) => {
  const { root, args, workbench } = await setup(t);
  const workspaceRoot = join(root, 'workspace');
  await mkdir(workspaceRoot);
  await writeFile(join(root, 'outside.html'), plain);
  await link(join(root, 'outside.html'), join(workspaceRoot, 'hard.html'));
  await writeFile(join(workspaceRoot, 'page.html'), plain);
  await writeFile(join(workspaceRoot, 'bad.html'), Buffer.from([0xf0, 0xff]));
  await writeFile(join(workspaceRoot, 'external.html'), '<h1>外部资源</h1><script src="https://example.com/script.js"></script>');
  await writeFile(join(workspaceRoot, 'large.html'), `<main>${'中'.repeat(350_000)}</main>`);
  const ctx = { signal: t.signal, agent: { session: { header: { cwd: workspaceRoot } } } };
  const tool = workbenchImportTool(workbench, () => ({ workspaceRoot }));
  const invoke = (file, input = {}) => tool.execute({ file, title: '工作区作品', ...input }, ctx);
  for (const file of ['../outside.html', 'hard.html', 'bad.html', 'page.txt']) assert.equal((await invoke(file)).ok, false);
  assert.equal((await invoke('large.html')).error.code, 'FINANCE_WORKBENCH_PAGE_TOO_LARGE');
  assert.equal((await invoke('external.html')).error.code, 'FINANCE_WORKBENCH_EXTERNAL_RESOURCE');
  const { data } = await invoke('page.html');
  assert.deepEqual(Object.keys(data), ['id', 'title', 'revision', 'directory', 'file']);
  assert.equal(await readFile(data.file, 'utf8'), plain);
  assert.equal((await invoke('page.html', { id: data.id })).error.code, 'FINANCE_WORKBENCH_INVALID_REVISION');
  const other = createWorkbench(args);
  const workspace = join(root, 'another-workspace');
  await mkdir(workspace);
  const updated = '<main>另一次会话修改</main>';
  await writeFile(join(workspace, 'updated.html'), updated);
  const otherCtx = { signal: t.signal, agent: { session: { header: { cwd: workspace } } } };
  const otherTool = workbenchImportTool(other, () => ({ workspaceRoot: workspace }));
  const found = await otherTool.execute({ action: 'list', search: '作品' }, { signal: t.signal });
  assert.deepEqual(found.data.pages.map((board) => board.id), [data.id]);
  assert.equal(found.data.truncated, false);
  assert.deepEqual((await otherTool.execute({ action: 'get', id: data.id }, { signal: t.signal })).data, { ...data, html: plain });
  const candidate = { id: data.id, revision: data.revision, title: data.title, file: 'updated.html' };
  assert.equal((await otherTool.execute(candidate, otherCtx)).error.code, 'FINANCE_WORKBENCH_DIRECTORY_REQUIRED');
  const update = await otherTool.execute({ ...candidate, expectedDirectory: found.data.directory }, otherCtx);
  assert.deepEqual({ ...update.data, file: data.file }, { ...data, revision: 2 });
  assert.notEqual(update.data.file, data.file);
  assert.equal(await readFile(update.data.file, 'utf8'), updated);
  assert.equal((await workbench.get(data.id)).data.html, updated);
});

test('tool reads saved HTML in bounded chunks pinned to the requested revision', async (t) => {
  const { workbench } = await setup(t);
  const html = `<main>${'a'.repeat(7993)}🧮${'b'.repeat(2000)}</main>`;
  const { data: page } = await workbench.create({ title: '大看板', html });
  const tool = workbenchImportTool(workbench, () => assert.fail('read resolves no workspace policy'));
  const invoke = (extra) => tool.execute({ action: 'get', id: page.id, ...extra }, { signal: t.signal });
  const { data: first } = await invoke({});
  assert.equal(first.html.length, 7999);
  assert.equal(first.nextOffset, 7999);
  const { data: second } = await invoke({ offset: first.nextOffset, revision: first.revision, expectedDirectory: first.directory });
  assert.equal(first.html + second.html, html);
  assert.equal(second.nextOffset, undefined);
  assert.equal((await invoke({ offset: first.nextOffset, revision: first.revision })).error.code, 'FINANCE_WORKBENCH_DIRECTORY_REQUIRED');
  assert.equal((await invoke({ offset: first.nextOffset, revision: 2, expectedDirectory: first.directory })).error.code,
    'FINANCE_WORKBENCH_CONFLICT');
});

test('a chat reference updates only the selected same-name board and fails on stale references', async (t) => {
  const { root, workbench } = await setup(t);
  const title = '双股 行情 "收盘版"';
  const { data: unrelated } = await workbench.create({ title, html: '<main>同名的另一看板</main>' });
  const { data: selected } = await workbench.create({ title, html: plain });
  const tool = workbenchImportTool(workbench, () => ({ workspaceRoot: root }));
  const ctx = { signal: t.signal, agent: { session: { header: { cwd: root } } } };
  const invoke = (input) => tool.execute(input, ctx);
  const matches = await invoke({ action: 'list', search: title });
  assert.deepEqual(new Set(matches.data.pages.map((page) => page.id)), new Set([unrelated.id, selected.id]));

  const reference = { id: selected.id, revision: selected.revision, expectedDirectory: selected.directory };
  const source = await invoke({ action: 'get', ...reference });
  assert.equal(source.data.title, title);
  assert.equal(source.data.html, plain);
  const file = '修改后.html';
  const changed = '<main>从选中的同名看板保存新版</main>';
  await writeFile(join(root, file), changed);
  const saved = await invoke({ file, title, ...reference });
  assert.equal(saved.data.id, selected.id);
  assert.equal(saved.data.revision, selected.revision + 1);
  assert.equal((await workbench.get(selected.id)).data.html, changed);
  assert.deepEqual((await workbench.get(unrelated.id)).data, unrelated);
  assert.equal((await workbench.list()).data.length, 2);
  assert.equal((await invoke({ action: 'get', ...reference })).error.code, 'FINANCE_WORKBENCH_CONFLICT');
  assert.equal((await invoke({ file, title, ...reference })).error.code, 'FINANCE_WORKBENCH_CONFLICT');

  const target = join(root, '另一个 看板库');
  const currentReference = { ...reference, revision: saved.data.revision };
  assert.equal((await workbench.setStorage({ directory: target, migrateExisting: true })).ok, true);
  assert.equal((await invoke({ action: 'get', ...currentReference })).error.code, 'FINANCE_WORKBENCH_DIRECTORY_CHANGED');
  assert.equal((await invoke({ file, title, ...currentReference })).error.code, 'FINANCE_WORKBENCH_DIRECTORY_CHANGED');
  assert.equal((await workbench.get(selected.id)).data.revision, currentReference.revision);
});

test('combined Typert face registers once and only shipped template bytes are trusted', async (t) => {
  const { args } = await setup(t);
  const workbench = createWorkbench({ ...args, templates: workbenchTemplates, getTemplateHtml, getTemplateSample });
  const faces = [];
  const plugins = [];
  mountFinanceBridge({ inject(_names, callback) {
    callback({ typert: { register: (face) => faces.push(face) }, plugin: (service) => plugins.push(service) });
  } }, {}, workbench);
  assert.equal(faces.length, 1);
  assert.equal(plugins.length, 2);
  assert.equal(new Set(faces[0].invocations.map((entry) => entry.id)).size, faces[0].invocations.length);
  const workbenchMethods = faces[0].invocations.filter((entry) => entry.namespace === 'hithinkFinanceWorkbench');
  assert.ok(workbenchMethods.some((entry) => entry.method === 'deletePage'));
  assert.ok(workbenchMethods.some((entry) => entry.method === 'storage'));
  assert.ok(workbenchMethods.some((entry) => entry.method === 'setStorage'));
  assert.ok(workbenchMethods.every((entry) => typeof plugins[0].prototype[entry.method] === 'function'));
  const pageReference = workbenchMethods.find((entry) => entry.method === 'get').parameters[0].codec.create();
  assert.equal(pageReference.parse('saved-id'), 'saved-id');
  const reference = { id: 'saved-id', expectedDirectory: args.userHome };
  assert.deepEqual(pageReference.parse(reference), reference);
  const liveMethod = workbenchMethods.find((entry) => entry.method === 'liveCase');
  assert.equal(liveMethod.mode, 'stream');
  assert.deepEqual(liveMethod.cancellation, { parameter: 'signal' });
  const templates = (await workbench.templateList()).data;
  assert.equal(templates.length, 23);
  assert.ok(templates.every((item) => !('html' in item) && !('sampleHtml' in item)));
  const staticPage = (await workbench.templateGet('template:stock-overview')).data;
  assert.equal(staticPage.dataMode, 'sample');
  assert.equal(staticPage.queries.length, 0);
  assert.equal(staticPage.trustedSample, true);
  const live = (await workbench.templateGet('template:fund-dca')).data;
  assert.equal(live.dataMode, 'live');
  assert.equal(live.html, undefined);
  assert.deepEqual(live.queries, []);
  const id = 'template:concept-constituents';
  const applied = (await workbench.applyTemplate({ id })).data;
  assert.equal(applied.trustedSample, true);
  assert.equal(applied.templateId, id);
  const edited = (await workbench.update({ id: applied.id, revision: 1, title: applied.title, html: plain })).data;
  assert.equal(edited.trustedSample, undefined);
  const arbitrary = (await workbench.create({ title: '页面', html: applied.html, trustedSample: true, templateId: id })).data;
  assert.equal(arbitrary.trustedSample, undefined);
  assert.equal(arbitrary.templateId, undefined);
  assert.equal((await workbench.applyTemplate({ id: 'template:fund-dca' })).error.code, 'FINANCE_WORKBENCH_TEMPLATE_UNAVAILABLE');
});

test('previously saved dynamic stock and financial templates still refresh using their stored declarations', async (t) => {
  const { args } = await setup(t, async (argv) => {
    const command = argv.slice(2, 4).join('.');
    return output(command, { item: [{ thscode: '000001.SZ' }] }, { source: 'remote' });
  });
  const queryClient = {
    async run(argv, ...options) {
      if (argv[0] !== 'schema') return args.cli.run(argv, ...options);
      const schema = schemas[argv[1]] ?? [{
        flags: '--thscode <code>', required: true, type: 'string',
      }, { flags: '--period <period>', type: 'string' }];
      return output('schema', { id: argv[1], command: argv[1].split('.'),
        options: [...schema, { flags: '--limit <limit>', type: 'integer' }] });
    },
  };
  const templates = { 'stock-overview': '01-stock-overview', 'financial-health': '02-financial-health' };
  const original = createWorkbench({ ...args, cli: queryClient,
    templates: workbenchTemplates.map((item) => item.id in templates ? { ...item, dataMode: 'live' } : item),
    getTemplateHtml: (id) => readFile(new URL(`./fixtures/legacy-workbench/${templates[id]}.live.html`, import.meta.url), 'utf8'),
  });
  const upgraded = createWorkbench({ ...args, cli: queryClient, templates: workbenchTemplates, getTemplateHtml, getTemplateSample });
  for (const [id, name, param] of [['stock-overview', 'quote', 'thscodes'], ['financial-health', 'income', 'thscode']]) {
    const saved = await original.applyTemplate({ id: `template:${id}` });
    assert.equal(saved.ok, true, JSON.stringify(saved.error));
    const { data: page } = await upgraded.get(saved.data.id);
    assert.equal(page.html, saved.data.html);
    assert.equal(page.templateId, `template:${id}`);
    assert.equal(page.trustedSample, undefined);
    const response = await upgraded.query({ pageId: page.id, revision: page.revision, name, params: { [param]: '000001.SZ' } });
    assert.equal(response.ok, true, JSON.stringify(response.error));
    assert.equal(response.data.item[0].thscode, '000001.SZ');
  }
});
