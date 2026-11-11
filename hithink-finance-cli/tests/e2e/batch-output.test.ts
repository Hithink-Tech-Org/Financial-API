import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { expect, test } from 'vitest';

test('compact batch exports preserve groups and empty targets; ordinary errors preserve the previous file', async () => {
  const key = randomUUID();
  let calls = 0,
    code = 0;
  const data = {
    interval: '1d',
    adjust: 'forward',
    item: [
      {
        thscode: '600519.SH',
        timestamp: 1790784000000,
        item: [{ date_ms: 1790784000000, close_price: 1.23456789 }],
      },
      { thscode: '000001.SZ', timestamp: null, item: [] },
    ],
  };
  const server = createServer((request, response) => {
    calls++;
    expect(request.headers['x-api-key']).toBe(key);
    const url = new URL(request.url!, 'http://fixture');
    expect(url.pathname).toBe('/api/a-share/prices/historical-batch');
    expect(url.searchParams.get('thscodes')).toBe('600519.SH,000001.SZ,999999.SH');
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        code,
        message: code ? 'failed' : 'ok',
        request_id: 'batch-request',
        data: code ? null : data,
      }),
    );
  });
  const directory = await mkdtemp(path.join(tmpdir(), 'finance-batch-'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('fixture unavailable');
    const codesFile = path.join(directory, 'codes.txt');
    await writeFile(codesFile, '600519.sh\n000001.SZ\n600519.SH\n999999.SH\n');
    const env = {
      HITHINK_FINANCE_FUYAO_BASE_URL: 'http://127.0.0.1:' + address.port,
      HITHINK_FINANCE_NO_WORKER: '1',
    };
    const args = [
      'dist/cli/main.js',
      'market',
      'history-batch',
      '--codes-file',
      codesFile,
      '--start-ms',
      '1790784000000',
      '--end-ms',
      '1790870400000',
      '--api-key-stdin',
      '--format',
      'json',
    ];
    for (const fileFormat of ['json', 'ndjson', 'csv']) {
      const file = path.join(directory, 'result.' + fileFormat);
      const result = await execa('node', [...args, '--output', file, '--file-format', fileFormat], {
        input: key,
        env,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data: { count: 2, path: file } });
      const content = await readFile(file, 'utf8');
      if (fileFormat === 'json') expect(JSON.parse(content)).toMatchObject({ ok: true, data });
      else if (fileFormat === 'ndjson')
        expect(
          content
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        ).toEqual(data.item);
      else expect(content).toContain('thscode,timestamp,item');
    }
    expect(calls).toBe(3);
    const file = path.join(directory, 'result.json');
    const preserved = await readFile(file, 'utf8');
    for (code of [3001, 3004, 5003]) {
      const result = await execa('node', [...args, '--output', file], {
        input: key,
        env,
        reject: false,
      });
      expect(result.exitCode).toBe(4);
      expect(result.stdout).toBe('');
      const error = JSON.parse(result.stderr);
      expect(error).toMatchObject({
        ok: false,
        error: { code: 'FUYAO_' + code, request_id: 'batch-request' },
      });
      expect(error).not.toHaveProperty('data');
      expect(await readFile(file, 'utf8')).toBe(preserved);
    }
    expect(calls).toBe(6);
    const invalidArgs = [
      'dist/cli/main.js',
      'market',
      'history-batch',
      '--thscodes',
      Array(11).fill('600519.SH').join(','),
      '--start-ms',
      '1790784000000',
      '--end-ms',
      '1790870400000',
      '--format',
      'json',
    ];
    const rejected = await execa('node', invalidArgs, { reject: false });
    expect(rejected.exitCode).toBe(2);
    expect(calls).toBe(6);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test('original fund snapshot accepts CSV100 and returns flat rows without changing its option name', async () => {
  const key = randomUUID();
  let calls = 0;
  const data = { timestamp: 1, item: [{ thscode: '510300.SH', last_price: 1, extra: null }] };
  const server = createServer((request, response) => {
    calls++;
    const url = new URL(request.url!, 'http://fixture');
    expect(url.pathname).toBe('/api/fund/market/snapshot');
    expect(url.searchParams.get('thscode')).toBe('510300.SH');
    expect(url.searchParams.has('thscodes')).toBe(false);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ code: 0, message: 'ok', data }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('fixture unavailable');
    const args = [
      'dist/cli/main.js',
      'fund',
      'snapshot',
      '--api-key-stdin',
      '--format',
      'json',
      '--thscode',
    ];
    const env = {
      HITHINK_FINANCE_FUYAO_BASE_URL: 'http://127.0.0.1:' + address.port,
      HITHINK_FINANCE_NO_WORKER: '1',
    };
    const result = await execa('node', [...args, Array(100).fill('510300.SH').join(',')], {
      input: key,
      env,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data });
    const rejected = await execa('node', [...args, Array(101).fill('510300.SH').join(',')], {
      input: key,
      env,
      reject: false,
    });
    expect(rejected.exitCode).toBe(2);
    expect(calls).toBe(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
