import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createAccount } from '../src/host/account.js';
import { accountRemote } from '../src/host/account-remote.js';
import { checkedEnvelope, FinanceError, resolveCliPackage } from '../src/host/cli.js';
import { createRender, renderTool } from '../src/host/render.js';
import { mountFinanceShell } from '../src/host/shell.js';
import { mountFinanceSkills } from '../src/host/skills.js';

function envelope(command, data, meta = {}) {
  return { exitCode: 0, stdout: JSON.stringify({ ok: true, command, data, meta }), stderr: '' };
}

function render(t, workspaceRoot) {
  const execute = createRender({ signal: t.signal, getWorkspacePolicy: () => ({ mode: 'read-only', workspaceRoot }) });
  const context = { signal: t.signal, agent: { session: { header: { cwd: workspaceRoot } } } };
  return { execute: (args) => execute(args, context), rawTool: renderTool(execute) };
}

test('reads a CLI result in a read-only session and persists mapped rows independently of the file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finance-render-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'history.json');
  await writeFile(file, JSON.stringify({ ok: true, command: 'market.history-batch', meta: { source: 'remote' }, data: {
    timestamp: 1795507200000, adjust: 'forward', interval: '1d', item: [
    { item: [{ date: '2026-11-24', price: { close: 11 }, internal: 'omitted-data' }, { date: '2026-11-25' }] },
  ] } }));
  const { execute, rawTool } = render(t, root);
  const args = {
    file: 'history.json', rowsPath: ['data', 'item', 0, 'item'], template: 'line',
    fields: [{ key: 'date', format: 'date' }, { key: 'close', label: '收盘价', path: ['price', 'close'] }],
    x: 'date', series: [{ key: 'close' }], interval: '日线', subtitle: '收盘价对比',
  };
  const value = await execute(args);
  assert.equal(value.ok, true);
  await rm(file);
  const metadata = rawTool.output.presentationMeta(args, value);
  assert.equal(metadata.version, 1);
  assert.equal(metadata.asOf, 1795507200000);
  assert.equal(metadata.adjust, 'forward');
  assert.equal(metadata.interval, '日线');
  assert.equal(metadata.origin, 'remote');
  assert.equal(metadata.subtitle, '收盘价对比');
  assert.deepEqual(metadata.rows, [{ date: '2026-11-24', close: 11 }, { date: '2026-11-25', close: null }]);
  assert.equal(metadata.truncated, false);
  assert.deepEqual(JSON.parse(rawTool.output.render(args, value)[0].text), {
    ok: true, template: 'line', displayedRows: 2, rowCount: 2, truncated: false,
  });
  assert.equal(defineTool(rawTool).name, 'hithink_finance_render');
});

test('restricts render files to a regular workspace file within the session policy', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-finance-scope-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const workspace = join(parent, 'workspace');
  await mkdir(workspace);
  const outside = join(parent, 'outside.json');
  await writeFile(outside, '[{"v":4}]');
  await link(outside, join(workspace, 'hard.json'));
  await symlink(parent, join(workspace, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const args = { template: 'table', fields: [{ key: 'v' }] };
  const { execute } = render(t, workspace);
  for (const file of ['../outside.json', outside, 'alias/outside.json', 'hard.json']) {
    const result = await execute({ ...args, file });
    assert.equal(result.error.code, 'FINANCE_RESULT_FILE_INVALID');
    assert.ok(!JSON.stringify(result).includes('outside.json'));
  }
  assert.equal((await render(t).execute({ ...args, file: 'source.json' })).error.code, 'FINANCE_WORKSPACE_REQUIRED');
  await writeFile(join(workspace, 'malformed.json'), 'not json');
  assert.equal((await execute({ ...args, file: 'malformed.json' })).error.code, 'FINANCE_RESULT_FILE_INVALID');
});

test('reads the adjustment from a single-symbol CLI history file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finance-history-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const item = [{ date_ms: 1795449600000, open_price: 10, close_price: 11, low_price: 9, high_price: 12 }];
  await writeFile(join(root, 'daily.json'), JSON.stringify({
    ok: true, command: 'market.history', data: { item }, meta: { source: 'remote', adjust: 'forward' },
  }));
  const args = { file: 'daily.json', template: 'kline', fields: Object.keys(item[0]).map((key) => ({ key })) };
  const { execute } = render(t, root);
  const result = await execute(args);
  assert.equal(result.view.adjust, 'forward');
  assert.deepEqual(result.view.rows, item);
  assert.equal((await execute({ ...args, adjust: 'forward adjusted' })).view.adjust, 'forward adjusted');
});

test('shows known CLI data times and preserves explicitly selected Unix times', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-finance-holdings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = { item: [{ stock_name: '示例持仓', hold_ratio: 5.14 }], timestamp: 0 };
  const source = { ok: true, command: 'fund.holdings', data, meta: { source: 'remote' } };
  const args = { template: 'ranking', fields: [{ key: 'stock_name' }, { key: 'hold_ratio' }] };
  const { execute } = render(t, root);
  await writeFile(join(root, 'holdings.json'), JSON.stringify(source));
  for (const input of [{ file: 'holdings.json' }, { data: source }]) {
    const result = await execute({ ...args, ...input });
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result.view, 'asOf'), false);
    assert.deepEqual(result.view.rows, data.item);
    assert.equal((await execute({ ...args, ...input, asOf: 0 })).view.asOf, 0);
    assert.equal((await execute({ ...args, ...input, asOf: -1000 })).view.asOf, -1000);
  }
  for (const timestamp of [-1, '0', '-1000', null, 'unknown']) {
    const result = await execute({ ...args, data: { ...source, data: { ...data, timestamp, as_of: '2026-11-24T07:00:00Z' } } });
    assert.equal(result.view.asOf, '2026-11-24T07:00:00Z');
  }
  const timestamp = 1795507200000;
  await writeFile(join(root, 'holdings.json'), JSON.stringify({ ...source, data: { ...data, timestamp } }));
  assert.equal((await execute({ ...args, file: 'holdings.json' })).view.asOf, timestamp);
  assert.equal((await execute({ ...args, data: { ...source, data: { ...data, timestamp: String(timestamp) } } })).view.asOf, timestamp);
});

test('bounds card data and carries custom source without execution', async (t) => {
  const { execute, rawTool } = render(t);
  const source = 'function render() { throw new Error("Only run in the browser worker"); }';
  const args = { data: Array.from({ length: 650 }, (_, i) => ({ id: i, label: '字'.repeat(4000) })),
    template: 'custom', custom: { source, height: 180 }, fields: [{ key: 'id' }, { key: 'label' }] };
  const result = await execute(args);
  assert.equal(result.ok, true);
  assert.equal(result.view.custom.source, source);
  assert.equal(result.view.truncated, true);
  assert.equal(result.view.rowCount, 650);
  assert.ok(result.view.rows.length > 0 && result.view.rows.length < 500);
  assert.ok(Buffer.byteLength(JSON.stringify(result.view)) <= 128 * 1024);
  assert.ok(!rawTool.output.render(args, result)[0].text.includes(source));
  assert.equal((await execute({ ...args, file: 'x.json' })).error.code, 'FINANCE_INVALID_RENDER_INPUT');
  assert.equal((await execute({ ...args, custom: { source: 'x'.repeat(33 * 1024) } })).error.code, 'FINANCE_INVALID_RENDER_INPUT');
});

test('registers the 14 original packaged CLI skills and one DSH presentation skill', async () => {
  const registrations = [];
  const { directory } = resolveCliPackage();
  await mountFinanceSkills({ skills: { register: (skill) => registrations.push(skill) } }, directory);
  assert.equal(registrations.length, 15);
  const skill = registrations.find(({ name }) => name === 'hithink-finance-market');
  assert.equal(skill.resourceBase.path, dirname(skill.path));
  const content = await readFile(skill.path, 'utf8');
  assert.ok(content.includes(skill.content) && content.includes(skill.description));
  assert.ok(registrations.find(({ name }) => name === 'hithink-finance-dsh').content.includes('hithink_finance_render'));
});

test('adds a single CLI launcher to the named profile PATH and removes it on disposal', async () => {
  const prior = process.env.PATH;
  const dispose = [];
  const scoped = {};
  mountFinanceShell({
    get: (key) => key === 'profileContext' ? {} : undefined,
    effect: (body) => dispose.push(body()),
    inject: (_keys, body) => body({ shellEnv: { register: (provider) => Object.assign(scoped, provider.resolve()) } }),
  }, resolveCliPackage().entry);
  const directory = scoped.DSH_HITHINK_FINANCE_BIN;
  try {
    assert.equal(process.env.PATH.split(delimiter)[0], directory);
    await access(join(directory, process.platform === 'win32' ? 'hithink-finance.cmd' : 'hithink-finance'));
  } finally {
    for (const cleanup of dispose) cleanup();
  }
  assert.equal(process.env.PATH, prior);
  await assert.rejects(access(directory), { code: 'ENOENT' });
});

test('Desktop native shell reuses its host executable without requiring a global Node.js', async () => {
  const previous = Object.getOwnPropertyDescriptor(process.versions, 'electron');
  Object.defineProperty(process.versions, 'electron', { value: '44.0.0', configurable: true });
  const scoped = {};
  let dispose;
  try {
    mountFinanceShell({
      get: () => undefined,
      effect: (body) => { dispose = body(); },
      inject: (_keys, body) => body({ shellEnv: { register: (provider) => Object.assign(scoped, provider.resolve()) } }),
    }, resolveCliPackage().entry);
    const windows = process.platform === 'win32';
    const launcher = await readFile(join(scoped.DSH_HITHINK_FINANCE_BIN, windows ? 'hithink-finance.cmd' : 'hithink-finance'), 'utf8');
    assert.ok(launcher.includes('ELECTRON_RUN_AS_NODE=1'));
    if (windows) assert.equal(scoped.DSH_HITHINK_FINANCE_NODE, process.execPath);
    else assert.ok(launcher.includes(process.execPath));
  } finally {
    if (previous) Object.defineProperty(process.versions, 'electron', previous);
    else delete process.versions.electron;
    dispose?.();
  }
});

test('account errors preserve safe CLI context and the remote revocation result', () => {
  const result = {
    exitCode: 3, stdout: '', stderr: JSON.stringify({
      ok: false, command: 'auth.logout', meta: { request_id: 'trace_123' },
      error: { code: 'AUTH_REVOCATION_INCOMPLETE', message: 'private upstream detail' },
    }),
  };
  assert.throws(() => checkedEnvelope(result, 'auth.logout'), (error) => (
    error.code === 'AUTH_REVOCATION_INCOMPLETE' && error.requestId === 'trace_123' && !error.message.includes('private')
  ));
});

test('account authorization belongs to the initiating bridge peer and client page', async (t) => {
  let loginRuns = 0;
  let logoutRuns = 0;
  const code = 'test-authorization-value';
  const url = 'https://upass.10jqka.com.cn/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A18765%2Foauth%2Fcallback&code_challenge_method=S256&state=' + code;
  const cli = {
    async run(argv, { signal, onLine }) {
      if (argv[1] === 'status') return { ...envelope('auth.status', { connected: false, active_method: 'oauth' }), exitCode: 3 };
      if (argv[1] === 'logout') {
        logoutRuns += 1;
        return envelope('auth.logout', { removed: true });
      }
      loginRuns += 1;
      assert.ok(argv.includes('--no-browser'));
      onLine(url);
      await once(signal, 'abort');
      throw new FinanceError('FINANCE_CANCELLED', 'cancelled');
    },
  };
  const account = createAccount(cli, t.signal);
  const own = 'web-client-id';
  const other = 'different-client-id';
  const connection = new AbortController();
  const active = account.start('peer', own, connection.signal);
  const first = (await active.next()).value;
  assert.equal(first.authorizationUrl, url);
  assert.equal(first.phase, 'pending');
  const repeat = account.start('peer', own, t.signal);
  assert.equal((await repeat.next()).value.attemptId, first.attemptId);
  await repeat.return();
  const foreign = account.start('other-peer', own, t.signal);
  assert.equal((await foreign.next()).value.error.code, 'AUTH_LOGIN_BUSY');
  await foreign.return();
  const different = account.start('peer', other, t.signal);
  assert.equal((await different.next()).value.authorizationUrl, undefined);
  await different.return();
  assert.equal((await account.status()).authorizationUrl, undefined);
  assert.equal((await account.cancel('other-peer', own, first.attemptId)).error.code, 'AUTH_ATTEMPT_NOT_FOUND');
  const terminal = active.next();
  connection.abort();
  assert.equal((await terminal).done, true);
  assert.equal((await account.status()).phase, 'cancelled');
  assert.equal(loginRuns, 1);

  const refreshed = account.start('peer', other, t.signal);
  const second = (await refreshed.next()).value;
  assert.equal(second.phase, 'pending');
  assert.notEqual(second.attemptId, first.attemptId);
  assert.equal((await account.cancel('peer', own, first.attemptId)).error.code, 'AUTH_ATTEMPT_NOT_FOUND');
  assert.equal((await account.cancel('peer', other, second.attemptId)).phase, 'cancelled');
  assert.equal((await refreshed.next()).value.phase, 'cancelled');
  assert.equal((await refreshed.next()).done, true);
  assert.equal(loginRuns, 2);
  assert.equal((await account.signOut('peer', false)).error.code, 'AUTH_CONFIRM_REQUIRED');
  assert.equal((await account.signOut(undefined, true)).error.code, 'AUTH_CONFIRM_REQUIRED');
  assert.equal(logoutRuns, 0);
  assert.equal((await account.signOut('peer', true)).phase, 'idle');
  assert.equal(logoutRuns, 1);
  assert.throws(() => accountRemote.descriptors.find((entry) => entry.method === 'logout').parameters[0].codec.create().parse(false));
});
