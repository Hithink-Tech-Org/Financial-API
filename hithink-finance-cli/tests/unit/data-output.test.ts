import { Writable } from 'node:stream';
import { expect, test } from 'vitest';
import { createCliContext, optionValue } from '../../src/cli/context.js';
import { successEnvelope } from '../../src/contracts/envelope.js';
import { renderResult } from '../../src/output/renderer.js';

async function output(command: string, data: unknown, args: string[] = [], width = 120) {
  let text = '';
  const stream = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        text += chunk;
        done();
      },
    }),
    { isTTY: true, columns: width },
  );
  await renderResult(successEnvelope(command, data, { requestId: 'test', source: 'remote' }), {
    ...createCliContext(['--lang', 'zh-CN', ...args]),
    stdout: stream as unknown as NodeJS.WriteStream,
  });
  return text;
}

test('market snapshot uses contractual CNY/share/percent units without fabricating names or rounding', async () => {
  const data = {
    timestamp: Date.UTC(2026, 9, 29, 1, 30),
    total: 5000,
    item: [
      {
        ticker: '000001',
        thscode: '000001.SZ',
        last_price: 12.3456789,
        price_change_ratio_pct: -1.234567,
        volume: 1000,
        turnover: 12345.6789,
        open_price: null,
      },
    ],
  };
  const text = await output('market.snapshot', data);
  expect(text).toContain('最新价(CNY)');
  expect(text).toContain('涨跌幅(%)');
  expect(text).toContain('成交量(股)');
  expect(text).toContain('12.3456789');
  expect(text).toContain('-1.234567');
  expect(text).toContain('2026-10-29 09:30:00');
  expect(text).not.toContain('名称');
  expect(text).toContain('--columns');
  expect(data.item[0]?.last_price).toBe(12.3456789);
});

test('preview and columns affect only terminal output, with explicit row and field notices', async () => {
  const data = {
    item: Array.from({ length: 25 }, (_, i) => ({
      thscode: `${i}.SH`,
      name: `标的${i}`,
      extra: i,
    })),
  };
  const text = await output('symbol.search', data);
  expect(text).toContain('25');
  expect(text).toContain('20');
  expect(text).toContain('标的19');
  expect(text).not.toContain('标的24');
  expect(await output('symbol.search', data, ['--max-rows', '0', '--columns', '*'])).toContain(
    '标的24',
  );
  const selected = await output('symbol.search', data, ['--columns', 'name', '--max-rows', '1']);
  expect(selected).toContain('标的0');
  expect(selected).not.toContain('0.SH');
  for (const format of ['json', 'ndjson']) {
    const machine = await output('symbol.search', data, [
      '--format',
      format,
      '--max-rows',
      '1',
      '--columns',
      'name',
    ]);
    expect(JSON.parse(machine).data).toEqual(data);
    if (format === 'ndjson') expect(machine.trim().split('\n')).toHaveLength(1);
  }
});

test('empty results, unknown columns, null and detail objects remain meaningful', async () => {
  expect(await output('symbol.search', { item: [] })).toContain('(empty)');
  const text = await output('valuation.snapshot', {
    item: [{ thscode: '000001.SZ', pe_ttm: -1.23456789, pb_mrq: null }],
  });
  expect(text).toContain('-1.23456789');
  expect(text).toContain('null');
  await expect(
    output('symbol.search', { item: [{ name: '测试' }] }, ['--columns', 'missing']),
  ).rejects.toMatchObject({ code: 'CLI_BAD_ARGUMENT' });
  expect(await output('fund.detail', { name: '基金', nested: { count: 0 } })).toContain('基金');
  const selectedDetail = await output('fund.detail', { name: '基金', nested: { count: 0 } }, [
    '--columns',
    'name',
  ]);
  expect(selectedDetail).toContain('基金');
  expect(selectedDetail).not.toContain('nested');
  expect(
    await output('symbol.list', { path: 'rows.csv', format: 'csv', count: 25 }, [
      '--columns',
      'name',
    ]),
  ).toContain('rows.csv');
  await expect(
    output('fund.detail', { name: '基金' }, ['--columns', 'missing']),
  ).rejects.toMatchObject({ code: 'CLI_BAD_ARGUMENT' });
});

test('numeric columns align right while ticker strings preserve leading zeroes', async () => {
  const text = await output('db.query', [
    { code: '000001', value: 1.2 },
    { code: '000002', value: 1234.5 },
  ]);
  expect(text).toContain('000001');
  const lines = text.split('\n').filter((line) => /^00000[12]/u.test(line));
  expect(lines).toHaveLength(2);
  expect(lines[0]?.length).toBe(lines[1]?.length);
  expect(lines[1]).toContain('1,234.5');
});

test('raw output options follow Commander last-value precedence and stop at --', () => {
  expect(optionValue(['--format=json', '--format', 'table'], '--format')).toBe('table');
  expect(optionValue(['--format', 'json', '--format=ndjson'], '--format')).toBe('ndjson');
  expect(optionValue(['--format', 'json', '--', '--format', 'table'], '--format')).toBe('json');
  expect(createCliContext(['--max-rows', '20', '--max-rows', '-1']).maxRows).toBeNaN();
});

test('English views retain units, history dates and scientific small values stay exact', async () => {
  const text = await output(
    'market.snapshot',
    { item: [{ thscode: '000001.SZ', last_price: 1e-30, volume: 1234567 }] },
    ['--lang', 'en'],
  );
  expect(text).toContain('last_price (CNY)');
  expect(text).toContain('volume (shares)');
  expect(text).toContain('1e-30');
  expect(text).toContain('1,234,567');
  const history = await output(
    'market.history',
    { item: [{ date_ms: Date.UTC(2026, 9, 28, 16), close_price: 1.23456789, close: 2.3456789 }] },
    ['--columns', '*'],
  );
  expect(history).toContain('2026-10-29');
  expect(history).toContain('1.23456789');
  expect(history).toContain('2.3456789');
});

test('CSV stdout obeys writable backpressure and extracts item rows', async () => {
  let text = '';
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, done) {
      text += chunk;
      setImmediate(done);
    },
  });
  const rows = Array.from({ length: 100 }, (_, value) => ({ code: '000001', value }));
  await renderResult(successEnvelope('symbol.list', { item: rows }, { requestId: 'csv' }), {
    ...createCliContext(['--format', 'csv']),
    stdout: stream as unknown as NodeJS.WriteStream,
  });
  expect(text.trim().split('\n')).toHaveLength(101);
  expect(text).toContain('000001,99');
});
