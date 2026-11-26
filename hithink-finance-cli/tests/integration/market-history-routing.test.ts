import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { executeCommand } from '../../src/cli/run.js';
import { openDatabase } from '../../src/infrastructure/duckdb/connection.js';
import { applyMigrations } from '../../src/infrastructure/duckdb/migrations.js';

const day = (date: string) => Date.parse(`${date}T00:00:00+08:00`);
const dates = ['2025-09-29', '2025-09-30', '2025-10-09', '2025-10-10'];
const codes = ['600519.SH', '000001.SZ'];
let root: string;
let filename: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hf-bars-'));
  filename = path.join(root, 'market.duckdb');
  const database = await openDatabase(filename);
  try {
    await applyMigrations(database.connection);
    await database.connection.run(
      "INSERT INTO _meta VALUES ('market_history_calendar', $calendar), ('last_adjustment_release_id', 'older-release')",
      { calendar: JSON.stringify(dates.map(day)) },
    );
    for (const thscode of codes) {
      for (const date of dates) {
        await database.connection.run(
          'INSERT INTO raw_kline_daily(thscode,date,open,high,low,close,volume,amount) VALUES ($thscode,$date,10,10,10,10,100,1000)',
          { thscode, date },
        );
      }
    }
  } finally {
    database.close();
  }
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

async function run(
  command: 'history' | 'history-batch',
  source: string,
  start = dates[0]!,
  end = dates[3]!,
  adjust = 'none',
  symbols = codes,
) {
  let stdout = '';
  let stderr = '';
  const stream = (append: (text: string) => void) =>
    new Writable({
      write(chunk, _encoding, done) {
        append(String(chunk));
        done();
      },
    }) as NodeJS.WriteStream;
  const exit = await executeCommand(
    [
      '--db',
      filename,
      '--format',
      'json',
      '--source',
      source,
      'market',
      command,
      command === 'history' ? '--thscode' : '--thscodes',
      command === 'history' ? symbols[0]! : symbols.join(','),
      '--start-ms',
      String(day(start)),
      '--end-ms',
      String(day(end)),
      '--adjust',
      adjust,
    ],
    {
      apiKey: randomUUID(),
      stdout: stream((text) => {
        stdout += text;
      }),
      stderr: stream((text) => {
        stderr += text;
      }),
    },
  );
  return { exit, result: JSON.parse(stdout || stderr) };
}

async function removeBars(date: string, thscode?: string) {
  const database = await openDatabase(filename);
  try {
    await database.connection.run(
      'DELETE FROM raw_kline_daily WHERE date=$date AND ($thscode IS NULL OR thscode=$thscode)',
      { date, thscode: thscode ?? null },
    );
  } finally {
    database.close();
  }
}

test('reads complete local daily prices and confirms an empty holiday without network', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const full = await run('history', 'local');
  expect(full.exit).toBe(0);
  expect(full.result.meta.source).toBe('local');
  expect(full.result.data.map((bar: { date: string }) => bar.date)).toEqual(dates);
  expect(full.result.data[0]).toMatchObject({ thscode: codes[0], close: 10, volume: 100 });
  const holiday = await run('history', 'local', '2025-10-01', '2025-10-08');
  expect(holiday.result.data).toEqual([]);
  expect(holiday.result.meta.source).toBe('local');
  expect(fetch).not.toHaveBeenCalled();
});

test('uses a verified trailing weekend and does not infer dates after the calendar response', async () => {
  const database = await openDatabase(filename);
  try {
    await database.connection.run(
      "UPDATE _meta SET value=$calendar WHERE key='market_history_calendar'",
      {
        calendar: JSON.stringify({ days: dates.map(day), through: day('2025-10-12') }),
      },
    );
  } finally {
    database.close();
  }
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const weekend = await run('history', 'local', '2025-10-11', '2025-10-12');
  expect(weekend.result.data).toEqual([]);
  expect(weekend.result.meta.source).toBe('local');
  const nextTradingDay = await run('history', 'local', '2025-10-13', '2025-10-13');
  expect(nextTradingDay.result.error.code).toBe('DATA_INITIALIZATION_REQUIRED');
  expect(fetch).not.toHaveBeenCalled();
});

test('detects a missing market-wide session and rejects unverified adjusted local prices', async () => {
  await removeBars(dates[1]!);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const missing = await run('history', 'local');
  expect(missing.exit).toBe(5);
  expect(missing.result.error.code).toBe('DATA_INITIALIZATION_REQUIRED');
  const forward = await run('history', 'local', dates[2], dates[3], 'forward');
  expect(forward.exit).toBe(5);
  expect(forward.result.error.code).toBe('DATA_INITIALIZATION_REQUIRED');
  expect(fetch).not.toHaveBeenCalled();
});

test('fills only per-code unadjusted batch gaps and preserves upstream bar fields', async () => {
  await removeBars(dates[1]!, codes[0]);
  await removeBars(dates[2]!, codes[1]);
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const query = new URL(String(input)).searchParams;
    const code = query.get('thscodes');
    const date = Number(query.get('start'));
    expect(query.get('end')).toBe(String(date));
    return Response.json({
      code: 0,
      message: 'ok',
      request_id: 'test-upstream',
      data: {
        interval: '1d',
        adjust: 'none',
        item: [
          {
            thscode: code,
            timestamp: date,
            item: [{ date_ms: date, close_price: 20, remote_field: 7 }],
          },
        ],
      },
    });
  });
  vi.stubGlobal('fetch', fetch);
  const response = await run('history-batch', 'auto');
  expect(response.exit).toBe(0);
  expect(response.result.meta.source).toBe('mixed');
  const groups = response.result.data.item;
  expect(groups.map((group: { thscode: string }) => group.thscode)).toEqual(codes);
  expect(groups[0].item[1]).toMatchObject({
    date_ms: day(dates[1]!),
    close_price: 20,
    remote_field: 7,
  });
  expect(groups[1].item[2]).toMatchObject({
    date_ms: day(dates[2]!),
    close_price: 20,
    remote_field: 7,
  });
  expect(
    fetch.mock.calls.map(([input]) => {
      const query = new URL(String(input)).searchParams;
      return [query.get('thscodes'), Number(query.get('start'))];
    }),
  ).toEqual([
    [codes[0], day(dates[1]!)],
    [codes[1], day(dates[2]!)],
  ]);
});

test('merges a remote tail outside the confirmed calendar and preserves valid empty groups', async () => {
  await removeBars(dates[1]!, codes[0]);
  const beyond = '2025-10-13';
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const query = new URL(String(input)).searchParams;
    const date = Number(query.get('start'));
    const tail = date === day('2025-10-11');
    return Response.json({
      code: 0,
      message: 'ok',
      data: {
        interval: '1d',
        adjust: 'none',
        item: query
          .get('thscodes')!
          .split(',')
          .map((thscode) => ({
            thscode,
            timestamp: tail ? day(beyond) : null,
            item: tail ? [{ date_ms: day(beyond), close_price: 30 }] : [],
          })),
      },
    });
  });
  vi.stubGlobal('fetch', fetch);
  const response = await run('history-batch', 'auto', dates[0], beyond);
  expect(response.exit).toBe(0);
  expect(response.result.meta.source).toBe('mixed');
  expect(response.result.data.item[0].item).toHaveLength(4);
  expect(response.result.data.item[0].timestamp).toBe(day(beyond));
  expect(response.result.data.item[1].item).toHaveLength(5);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('fails a required batch gap when upstream omits the known symbol', async () => {
  await removeBars(dates[1]!, codes[0]);
  const fetch = vi.fn(async () =>
    Response.json({
      code: 0,
      message: 'ok',
      data: { interval: '1d', adjust: 'none', item: [] },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const response = await run('history-batch', 'auto');
  expect(response.exit).toBe(4);
  expect(response.result.error.code).toBe('UPSTREAM_INVALID_RESPONSE');
  expect(response.result.ok).toBe(false);
  expect(response.result.data).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});
