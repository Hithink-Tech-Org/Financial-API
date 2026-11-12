import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import { connectWorker } from '../../src/cli/worker/client.js';
import { buildId, requestEnvironment, type WorkerIdentity } from '../../src/cli/worker/paths.js';
import { next, send } from '../../src/cli/worker/protocol.js';

const main = path.resolve('dist/cli/main.js');
async function fixture(
  action: (input: {
    env: NodeJS.ProcessEnv;
    home: string;
    key: string;
    count: () => number;
    setKey: (key: string) => void;
    cli: (args: string[], cwd?: string, input?: string) => ReturnType<typeof execa>;
  }) => Promise<void>,
) {
  const home = await mkdtemp(
    path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'finance-query-worker-'),
  );
  const key = randomUUID();
  let allowedKey = key;
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    response.setHeader('content-type', 'application/json');
    if (request.headers['x-api-key'] !== allowedKey) {
      response.end(JSON.stringify({ code: 2003, message: 'fixture denied', data: null }));
      return;
    }
    const query = new URL(request.url!, 'http://fixture').searchParams;
    const body = JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        item: [
          {
            thscode: '600519.SH',
            name:
              query.get('q') === 'large'
                ? '中文🙂'.repeat(100000)
                : query.get('q') === 'long'
                  ? '中文🙂'.repeat(10000)
                  : '中文🙂',
            value: 1.23456789,
          },
        ],
      },
    });
    if (query.get('limit') === '2') setTimeout(() => response.end(body), 350);
    else response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('fixture unavailable');
  const env = {
    HITHINK_FINANCE_NO_WORKER: '0',
    HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
    HITHINK_TEST_USER_HOME: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    HITHINK_FINANCE_API_KEY: undefined,
    API_KEY: undefined,
    FUYAO_TOKEN: undefined,
    HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${address.port}`,
  };
  const directories = new Set([process.cwd()]);
  const cli = (args: string[], cwd = process.cwd(), input = key) => {
    directories.add(cwd);
    return execa('node', [main, ...args], { env, cwd, input, reject: false, timeout: 15000 });
  };
  try {
    await action({
      env,
      home,
      key,
      count: () => calls,
      setKey: (value) => {
        allowedKey = value;
      },
      cli,
    });
  } finally {
    for (const cwd of [...directories]) await cli(['worker', 'stop', '--format', 'json'], cwd);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
}
const snapshot = [
  'market',
  'snapshot',
  '--thscodes',
  '600519.SH',
  '--api-key-stdin',
  '--format',
  'json',
];

test('separate commands reuse one worker while contexts, stdin, UTF8 and output paths stay independent', async () => {
  await fixture(async ({ home, cli }) => {
    expect(
      JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data.running,
    ).toBe(false);
    const a = path.join(home, 'a'),
      b = path.join(home, 'b');
    await mkdir(a);
    await mkdir(b);
    await Promise.all([writeConfig(a, 'en'), writeConfig(b, 'zh-CN')]);
    const first = await cli(snapshot, a);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout).data.item[0].name).toBe('中文🙂');
    const status = JSON.parse((await cli(['worker', 'status', '--format', 'json'], a)).stdout).data;
    expect(status.state).toBe('running');
    for (const [cwd, format] of [
      [a, 'json'],
      [b, 'ndjson'],
    ] as const) {
      const result = await cli(
        [...snapshot, '--output', `rows.${format}`, '--file-format', format],
        cwd,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).data.path).toBe(path.join(cwd, `rows.${format}`));
      expect(await readFile(path.join(cwd, `rows.${format}`), 'utf8')).toContain('中文🙂');
    }
    expect(
      JSON.parse((await cli(['worker', 'status', '--format', 'json'], a)).stdout).data.pid,
    ).toBe(status.pid);
    expect(
      JSON.parse((await cli(['worker', 'status', '--format', 'json'], b)).stdout).data.pid,
    ).not.toBe(status.pid);
    const search = ['symbol', 'search', '--q', '中文', '--api-key-stdin', '--format', 'table'];
    expect((await cli(search, a)).stdout).toContain('symbol.search');
    expect((await cli(search, b)).stdout).toContain('标的检索');
    const long = await cli([
      'symbol',
      'search',
      '--q',
      'long',
      '--api-key-stdin',
      '--format',
      'json',
    ]);
    expect(JSON.parse(long.stdout).data.item[0].name.length).toBe('中文🙂'.length * 10000);
  });
}, 30000);

test('startup failure forwards the already consumed stdin to the ordinary path once', async () => {
  await fixture(async ({ home, count, cli }) => {
    await writeFile(path.join(home, '.hithink-finance'), 'blocked');
    const result = await cli(snapshot);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(count()).toBe(1);
  });
}, 20000);

test('unavailable user home falls back before dispatch with an explicit stdin key', async () => {
  await fixture(async ({ home, env, key, count }) => {
    const shim = path.join(home, 'unavailable-home.mjs');
    await writeFile(
      shim,
      "import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';os.userInfo=()=>{throw Error('unavailable OS home');};syncBuiltinESMExports();",
    );
    const result = await execa('node', ['--import', pathToFileURL(shim).href, main, ...snapshot], {
      env,
      input: key,
      reject: false,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(count()).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(key);
  });
}, 20000);

test('expired queue requests never execute an API request', async () => {
  await fixture(async ({ home, key, env, count, cli }) => {
    expect((await cli(snapshot)).exitCode).toBe(0);
    const id = (await readdir(path.join(home, '.hithink-finance/cli-workers')))[0]!;
    const root = path.join(home, '.hithink-finance/cli-workers', id);
    const record = JSON.parse(await readFile(path.join(root, 'worker.json'), 'utf8'));
    const paths: WorkerIdentity = {
      id,
      root,
      packageRoot: process.cwd(),
      build: (await buildId(process.cwd()))!,
      document: path.join(root, 'worker.json'),
      lock: path.join(root, 'worker-lock.sqlite'),
      environment: 'production',
    };
    async function submit(name: string, argv: string[], deadline: number) {
      const connection = await connectWorker(paths, record);
      await send(connection.socket, {
        t: 'run',
        id: name,
        build: paths.build,
        argv,
        cwd: process.cwd(),
        env: requestEnvironment({ ...requestEnvironment(process.env), ...env }),
        stdin: key,
        tty: { stdout: false, stderr: false, columns: 80 },
        deadline,
      });
      expect((await next(connection.reader)).t).toBe('accepted');
      return connection;
    }
    const first = await submit('first', [...snapshot, '--limit', '2'], Date.now() + 5000);
    const expired = await submit('expired', snapshot, Date.now() + 30);
    let errors = '';
    for await (const frame of first.reader) if (frame.t === 'done') break;
    first.socket.destroy();
    for await (const frame of expired.reader) {
      if (frame.t === 'output' && frame.channel === 'stderr')
        errors += Buffer.from(String(frame.data), 'base64').toString('utf8');
      if (frame.t === 'done') break;
    }
    expired.socket.destroy();
    expect(JSON.parse(errors).error.code).toBe('CLI_CANCELLED');
    expect(count()).toBe(2);
  });
}, 30000);

test('a disconnected client cancels only its own query and the worker remains usable', async () => {
  await fixture(async ({ cli }) => {
    expect((await cli(snapshot)).exitCode).toBe(0);
    const status = JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data;
    const delayed = cli([...snapshot, '--limit', '2']);
    await new Promise((resolve) => setTimeout(resolve, 180));
    delayed.kill('SIGTERM');
    await delayed;
    expect((await cli(snapshot)).exitCode).toBe(0);
    expect(JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data.pid).toBe(
      status.pid,
    );
  });
}, 30000);

async function writeConfig(directory: string, language: string) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    path.join(directory, 'hithink-finance.config.json'),
    JSON.stringify({ language }),
  );
}

test('concurrent first invocations publish one owner and leave credentials out of the registry', async () => {
  await fixture(async ({ home, key, cli }) => {
    const results = await Promise.all([cli(snapshot), cli(snapshot), cli(snapshot)]);
    for (const result of results) expect(result.exitCode, result.stderr).toBe(0);
    const status = JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data;
    expect(status.state).toBe('running');
    const { readdir } = await import('node:fs/promises');
    const roots = await readdir(path.join(home, '.hithink-finance/cli-workers'));
    expect(roots).toHaveLength(1);
    const record = await readFile(
      path.join(home, '.hithink-finance/cli-workers', roots[0]!, 'worker.json'),
      'utf8',
    );
    expect(record).not.toContain(key);
    expect(JSON.parse(record).pid).toBe(status.pid);
  });
}, 30000);

test('slow stdout consumers receive the complete result after the IPC peer finishes', async () => {
  await fixture(async ({ env, key, cli }) => {
    expect((await cli(snapshot)).exitCode).toBe(0);
    const child = spawn(
      process.execPath,
      [main, 'symbol', 'search', '--q', 'large', '--api-key-stdin', '--format', 'json'],
      { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    let errors = '';
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.stdin.end(key);
    child.stdout.on('data', (value: Buffer) => {
      chunks.push(value);
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), 10);
    });
    const timeout = setTimeout(() => child.kill(), 10000);
    const code = await new Promise((resolve) => child.on('close', resolve));
    clearTimeout(timeout);
    const text = Buffer.concat(chunks).toString('utf8');
    expect(code, errors).toBe(0);
    expect(JSON.parse(text).data.item[0].name.length).toBe('中文🙂'.length * 100000);
  });
}, 30000);

test('ready with zero tasks is reclaimed even if the first client never sends a job', async () => {
  await fixture(async ({ env, cli }) => {
    const child = execa('node', ['tests/fixtures/query-worker.mjs', '150'], {
      env,
      timeout: 15000,
      reject: false,
    });
    const result = await child;
    expect(result.exitCode, result.stderr).toBe(0);
    expect(
      JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data.running,
    ).toBe(false);
  });
}, 20000);

test('a live unrelated PID in stale state does not pin the old generation', async () => {
  await fixture(async ({ env, cli }) => {
    const stale = await execa('node', ['tests/fixtures/stale-worker.mjs'], { env });
    const result = await cli(snapshot);
    expect(result.exitCode, result.stderr).toBe(0);
    const status = JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data;
    expect(status.state).toBe('running');
    expect(status.pid).not.toBe(Number(stale.stdout));
  });
}, 30000);

test('loss of completion after submission never replays in the foreground', async () => {
  await fixture(async ({ env, home, cli }) => {
    const child = execa('node', ['tests/fixtures/failed-worker.mjs'], {
      env,
      reject: false,
      timeout: 15000,
    });
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on('data', (chunk) => {
        if (chunk.toString().includes('ready')) resolve();
      });
      child.on('error', reject);
    });
    const result = await cli(['--lang', 'en', ...snapshot]);
    expect(result.exitCode).toBe(5);
    expect(JSON.parse(result.stderr).error.code).toBe('WORKER_RESULT_UNKNOWN');
    expect(await readFile(path.join(home, 'submitted.txt'), 'utf8')).toBe('submitted\n');
    expect((await child).exitCode).toBe(0);
  });
}, 30000);

test('credential replacement and logout are observed by the next request in the same worker', async () => {
  await fixture(async ({ cli, setKey }) => {
    expect(
      (await cli(['auth', 'login', '--method', 'api-key', '--api-key-stdin', '--format', 'json']))
        .exitCode,
    ).toBe(0);
    const command = snapshot.filter((arg) => arg !== '--api-key-stdin');
    expect((await cli(command)).exitCode).toBe(0);
    const pid = JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data.pid;
    const replacement = randomUUID();
    setKey(replacement);
    expect(
      (
        await cli(
          ['auth', 'login', '--method', 'api-key', '--api-key-stdin', '--format', 'json'],
          process.cwd(),
          replacement,
        )
      ).exitCode,
    ).toBe(0);
    expect((await cli(command)).exitCode).toBe(0);
    expect(JSON.parse((await cli(['worker', 'status', '--format', 'json'])).stdout).data.pid).toBe(
      pid,
    );
    expect((await cli(['auth', 'logout', '--all', '--format', 'json'])).exitCode).toBe(0);
    const result = await cli(command);
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe('AUTH_LOGIN_REQUIRED');
  });
}, 30000);
