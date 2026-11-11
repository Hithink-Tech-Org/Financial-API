import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { expect, test } from 'vitest';

test('remote file formats export complete rows independent of table preview, with one request', async () => {
  const key = randomUUID();
  let calls = 0;
  const item = Array.from({ length: 25 }, (_, i) => ({
    thscode: `${String(i).padStart(6, '0')}.SH`,
    name: `测试${i}`,
    price: -1.23456789,
    extra: null,
  }));
  const server = createServer((request, response) => {
    calls++;
    expect(request.headers['x-api-key']).toBe(key);
    const query = new URL(request.url!, 'http://fixture').searchParams;
    expect(query.has('fileFormat')).toBe(false);
    expect(query.has('maxRows')).toBe(false);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ code: 0, message: 'ok', data: { timestamp: 1, item } }));
  });
  const directory = await mkdtemp(path.join(tmpdir(), 'finance-output-e2e-'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('fixture unavailable');
    const env = { HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${address.port}` };
    const args = [
      'dist/cli/main.js',
      'symbol',
      'search',
      '--q',
      '测试',
      '--limit',
      '25',
      '--api-key-stdin',
      '--format',
      'json',
      '--max-rows',
      '1',
      '--columns',
      'name',
    ];
    for (const format of ['json', 'ndjson', 'csv']) {
      const file = path.join(directory, `rows.${format}`);
      const result = await execa('node', [...args, '--output', file, '--file-format', format], {
        input: key,
        env,
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        data: { path: file, format, count: 25 },
      });
      const text = await readFile(file, 'utf8');
      if (format === 'json') expect(JSON.parse(text).data.item).toEqual(item);
      else if (format === 'ndjson')
        expect(
          text
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        ).toEqual(item);
      else {
        expect(text).toContain('thscode,name,price,extra\n');
        expect(text).toContain('测试24');
      }
    }
    expect(calls).toBe(3);
    for (const badArgs of [
      ['--file-format', 'ndjson'],
      ['--max-rows', '-1'],
      ['--max-rows', ''],
      ['--columns', 'name,*'],
    ]) {
      const invalid = await execa('node', [...args, ...badArgs], {
        input: key,
        env,
        reject: false,
      });
      expect(invalid.exitCode).toBe(2);
      expect(invalid.stdout).toBe('');
      expect(JSON.parse(invalid.stderr).ok).toBe(false);
    }
    expect(calls).toBe(3);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('discovery exposes export and table options', async () => {
  const result = await execa('node', [
    'dist/cli/main.js',
    'schema',
    'symbol.search',
    '--format',
    'json',
  ]);
  const schema = JSON.parse(result.stdout).data;
  expect(schema.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        flags: '--file-format <format>',
        choices: ['json', 'ndjson', 'csv'],
      }),
    ]),
  );
  expect(schema.global_options.map((option: { flags: string }) => option.flags)).toEqual([
    '--max-rows <count>',
    '--columns <fields>',
  ]);
  const published = JSON.parse(await readFile('schemas/capabilities.json', 'utf8'));
  expect(published.global_options).toEqual(schema.global_options);
});
