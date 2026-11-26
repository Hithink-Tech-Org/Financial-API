import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAccount } from '../src/host/account.js';
import { accountRemote } from '../src/host/account-remote.js';
import { createCliRunner } from '../src/host/cli.js';

test('API Key submits through child stdin, preserves OAuth, and supports replace, select and logout', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-finance-auth-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entry = join(directory, 'cli.mjs');
  await writeFile(join(directory, 'state.json'), '{"active_method":"oauth","oauth":true,"api-key":false}');
  await writeFile(entry, `
import { readFileSync, writeFileSync } from 'node:fs';
const [, action, method] = process.argv.slice(2);
const file = new URL('state.json', import.meta.url);
const state = JSON.parse(readFileSync(file, 'utf8'));
function status() {
  return {
    connected: Boolean(state[state.active_method]), active_method: state.active_method,
    credentials: Object.fromEntries(['oauth', 'api-key'].map((name) => [name, { state: state[name] ? 'available' : 'missing' }]))
  };
}
if (action === 'login') {
  if (!process.argv.includes('--api-key-stdin')) throw new Error('Missing stdin flag');
  const key = readFileSync(0, 'utf8');
  if (!['valid-fixture-key', 'second-fixture-key'].includes(key)) {
    console.error(JSON.stringify({ok:false, command:'auth.login', error:{code:'FUYAO_2001', message:key, request_id:key}}));
    process.exit(3);
  }
  state['api-key'] = key;
  state.active_method = 'api-key';
}
if (action === 'use') state.active_method = method;
if (action === 'logout') state[state.active_method] = false;
if (action !== 'status') writeFileSync(file, JSON.stringify(state));
const data = status();
if (action === 'status' && !data.connected) process.exitCode = 3;
console.log(JSON.stringify({ok:true, command:'auth.' + action, data}));
`);
  const runs = [];
  const account = createAccount(createCliRunner({
    resolvePackage: () => ({ entry }),
    spawnProcess(executable, argv, options) {
      assert.equal(options.shell, false);
      assert.ok(!argv.some((arg) => arg.endsWith('fixture-key')));
      assert.ok(!Object.values(options.env).some((value) => value?.endsWith('fixture-key')));
      assert.equal(options.stdio[0], argv.includes('--api-key-stdin') ? 'pipe' : 'ignore');
      runs.push(argv.slice(1, -3));
      return spawn(executable, argv, options);
    },
  }), t.signal);
  await account.status();
  assert.equal((await account.loginApiKey(undefined, 'valid-fixture-key')).error.code, 'FINANCE_UI_REQUIRED');
  assert.equal((await account.loginApiKey('peer', 'embedded\nnewline')).error.code, 'FINANCE_INVALID_API_KEY_INPUT');
  assert.equal(runs.length, 1);

  const verify = account.loginApiKey('peer', 'valid-fixture-key');
  assert.equal((await account.selectMethod('peer', 'oauth')).error.code, 'AUTH_CHANGE_PENDING');
  const key = await verify;
  assert.equal(key.method, 'api-key');
  assert.deepEqual(key.credentials, { oauth: 'available', apiKey: 'available' });
  assert.ok(!JSON.stringify(key).includes('valid-fixture-key'));

  const invalid = await account.loginApiKey('peer', 'invalid-fixture-key');
  assert.equal(invalid.error.code, 'FUYAO_2001');
  assert.equal(invalid.method, 'api-key');
  assert.ok(!JSON.stringify(invalid).includes('invalid-fixture-key'));
  assert.deepEqual(invalid.credentials, key.credentials);

  assert.equal((await account.loginApiKey('peer', 'second-fixture-key')).method, 'api-key');
  assert.equal((await account.selectMethod('peer', 'oauth')).method, 'oauth');
  assert.equal((await account.selectMethod('peer', 'api-key')).method, 'api-key');
  assert.deepEqual((await account.signOut('peer', true)).credentials, { oauth: 'available', apiKey: 'missing' });
  assert.equal((await account.selectMethod('peer', 'oauth')).connected, true);
  for (const [method, value] of [['loginApiKey', {}], ['selectMethod', 'any']]) {
    const { parameters } = accountRemote.descriptors.find((entry) => entry.method === method);
    assert.throws(() => parameters[0].codec.create().parse(value), /Invalid account/);
  }
});
