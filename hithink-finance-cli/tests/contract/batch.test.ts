import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { remoteCapabilities } from '../../src/contracts/remote-capabilities.js';
import { executeRemoteQuery } from '../../src/application/use-cases/remote-query.js';
import { FuyaoClient } from '../../src/infrastructure/fuyao/client.js';

const batches = [
  ['market.history-batch', 10],
  ['index.history-batch', 10],
  ['fund.history-batch', 10],
  ['financials.income-batch', 10],
  ['financials.balance-sheet-batch', 10],
  ['financials.cash-flow-batch', 10],
] as const;
const startMs = Date.UTC(2026, 9, 1);
const endMs = Date.UTC(2026, 9, 2);
const apiKey = randomUUID();

describe.each(batches)('%s', (id, maximum) => {
  test('validates raw token limits before stable normalization', () => {
    const capability = remoteCapabilities.find((item) => item.id === id)!;
    expect(capability).toBeDefined();
    const input = {
      thscodes: ' 600519.sh,600519.SH ',
      ...(id.includes('history') ? { startMs, endMs } : {}),
    };
    expect(capability.inputSchema.parse(input).thscodes).toBe('600519.SH');
    expect(
      capability.inputSchema.safeParse({
        ...input,
        thscodes: Array(maximum).fill('600519.SH').join(','),
        ...(id.startsWith('financials.') ? { limit: 20 } : {}),
      }).success,
    ).toBe(true);
    expect(capability.inputSchema.safeParse({ ...input, thscodes: ',600519.SH' }).success).toBe(
      false,
    );
    expect(
      capability.inputSchema.safeParse({
        ...input,
        thscodes: Array(maximum + 1)
          .fill('600519.SH')
          .join(','),
      }).success,
    ).toBe(false);
  });
});

test('index batch accepts directory codes with letters and varied market suffixes', () => {
  const capability = remoteCapabilities.find((item) => item.id === 'index.history-batch')!;
  expect(
    capability.inputSchema.parse({
      thscodes: '000860.CSI,000510.csi,H30269.CSI,CI005001.CI',
      startMs,
      endMs,
    }).thscodes,
  ).toBe('000860.CSI,000510.CSI,H30269.CSI,CI005001.CI');
  for (const thscodes of ['000860', '.CSI', '000860.', '000860.CSI.EXTRA', 'H30 269.CSI']) {
    expect(capability.inputSchema.safeParse({ thscodes, startMs, endMs }).success).toBe(false);
  }
});

const historyData = {
  interval: '1d',
  adjust: 'forward',
  item: [
    { thscode: '600519.SH', timestamp: startMs, item: [{ date_ms: startMs, close_price: null }] },
    { thscode: '000001.SZ', timestamp: startMs, item: [{ date_ms: startMs, close_price: 2 }] },
    { thscode: '600000.SH', timestamp: null, item: [] },
  ],
};
const financialData = {
  item: [
    {
      thscode: '600519.SH',
      timestamp: startMs,
      item: [
        {
          thscode: '600519.SH',
          ticker: '600519',
          period: 'annual',
          fiscal_year: 2025,
          fiscal_period: 'FY',
          period_end_ms: startMs,
          currency: 'CNY',
          net_profit: null,
          original_field: 1,
        },
      ],
    },
    { thscode: '600000.SH', timestamp: null, item: [] },
  ],
};

test.each(batches)('%s retains compact groups, null metadata and original rows', async (id) => {
  const capability = remoteCapabilities.find((item) => item.id === id)!;
  const data = id.includes('history')
    ? {
        ...historyData,
        adjust: id === 'market.history-batch' ? 'forward' : null,
      }
    : financialData;
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    expect(String(url)).toContain(capability.endpoint);
    return new Response(JSON.stringify({ code: 0, message: 'ok', data }));
  });
  const client = new FuyaoClient({
    baseUrl: 'http://fixture',
    auth: { method: 'api-key', apiKey, profile: 'default', source: 'explicit' },
    fetch,
  });
  const input = capability.inputSchema.parse({
    thscodes: '600519.SH,000001.SZ,600000.SH,999999.SH',
    ...(id.includes('history') ? { startMs, endMs } : { period: 'annual', limit: 4 }),
  });
  expect((await executeRemoteQuery(capability, input, client)).data).toEqual(data);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('fund snapshot accepts CSV100 under the original thscode option and keeps a flat payload', async () => {
  const capability = remoteCapabilities.find((item) => item.id === 'fund.snapshot')!;
  expect(
    capability.inputSchema.parse({ thscode: Array(100).fill(' 510300.sh ').join(',') }).thscode,
  ).toBe('510300.SH');
  for (const thscode of [Array(101).fill('510300.SH').join(','), '510300.SH,', '']) {
    expect(capability.inputSchema.safeParse({ thscode }).success).toBe(false);
  }
  const data = {
    timestamp: startMs,
    item: [{ thscode: '510300.SH', last_price: 1, unknown_original_field: null }],
  };
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    const query = new URL(String(url)).searchParams;
    expect(query.get('thscode')).toBe('510300.SH,161725.SZ,999999.SH');
    expect(query.has('thscodes')).toBe(false);
    return new Response(JSON.stringify({ code: 0, message: 'ok', data }));
  });
  const client = new FuyaoClient({
    baseUrl: 'http://fixture',
    auth: { method: 'api-key', apiKey, profile: 'default', source: 'explicit' },
    fetch,
  });
  expect(
    (
      await executeRemoteQuery(
        capability,
        capability.inputSchema.parse({
          thscode: '510300.SH,161725.SZ,999999.SH',
        }),
        client,
      )
    ).data,
  ).toEqual(data);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('fund snapshot CSV keeps the original client recovery strategy', async () => {
  const capability = remoteCapabilities.find((item) => item.id === 'fund.snapshot')!;
  const data = { timestamp: startMs, item: [{ thscode: '510300.SH', last_price: 1 }] };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 5003, message: 'temporary', data: null })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, message: 'ok', data })));
  const client = new FuyaoClient({
    baseUrl: 'http://fixture',
    auth: { method: 'api-key', apiKey, profile: 'default', source: 'explicit' },
    fetch,
    sleep: async () => {},
  });
  expect(
    (await executeRemoteQuery(capability, { thscode: '510300.SH,161725.SZ' }, client)).data,
  ).toEqual(data);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('batch OAuth retains one-time recovery after explicit auth rejection', async () => {
  const capability = remoteCapabilities.find((item) => item.id === 'market.history-batch')!;
  const initialToken = randomUUID(),
    renewedToken = randomUUID();
  const refresh = vi.fn(async () => renewedToken);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 2001, message: 'expired', data: null })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, message: 'ok', data: historyData })),
    );
  const client = new FuyaoClient({
    baseUrl: 'https://fixture',
    auth: {
      method: 'oauth',
      source: 'global',
      sessionId: randomUUID(),
      apiOrigin: 'https://fixture',
      accessToken: async () => initialToken,
      refresh,
    },
    fetch,
  });
  expect(
    (await executeRemoteQuery(capability, { thscodes: '600519.SH', startMs, endMs }, client)).data,
  ).toEqual(historyData);
  expect(refresh).toHaveBeenCalledExactlyOnceWith(initialToken);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(['network', 'business', 'http', 'target'] as const)(
  'batch does not retry %s failures',
  async (kind) => {
    const capability = remoteCapabilities.find((item) => item.id === 'market.history-batch')!;
    const fetch = vi.fn(async () => {
      if (kind === 'network') throw new TypeError('network');
      return new Response(
        JSON.stringify({ code: kind === 'target' ? 3001 : 5003, message: 'failed', data: null }),
        { status: kind === 'http' ? 503 : 200 },
      );
    });
    const client = new FuyaoClient({
      baseUrl: 'http://fixture',
      auth: { method: 'api-key', apiKey, profile: 'default', source: 'explicit' },
      fetch,
    });
    await expect(
      executeRemoteQuery(capability, { thscodes: '999999.SH', startMs, endMs }, client),
    ).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test('batch output rejects malformed group identity and rows', () => {
  const capability = remoteCapabilities.find((item) => item.id === 'market.history-batch')!;
  for (const data of [
    { interval: '1d', adjust: 'forward', item: [{ timestamp: null, item: [] }] },
    {
      interval: '1d',
      adjust: 'forward',
      item: [{ thscode: '600519.SH', timestamp: null, item: null }],
    },
  ])
    expect(capability.outputSchema.safeParse(data).success).toBe(false);
});

test('index boundary is anchored to the Shanghai query day and A-share years are independent of code count', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-11-02T16:30:00Z'));
    const boundary = new Date('2021-11-03T00:00:00+08:00').getTime();
    for (const id of ['index.history', 'index.history-batch']) {
      const capability = remoteCapabilities.find((item) => item.id === id)!;
      const target = id.endsWith('-batch') ? { thscodes: '000300.SH' } : { thscode: '000300.SH' };
      expect(
        capability.inputSchema.safeParse({ ...target, startMs: boundary, endMs: Date.now() })
          .success,
      ).toBe(true);
      expect(
        capability.inputSchema.safeParse({ ...target, startMs: boundary - 1, endMs: boundary })
          .success,
      ).toBe(false);
    }
    const capability = remoteCapabilities.find((item) => item.id === 'market.history-batch')!;
    const input = {
      thscodes: Array(10).fill('600519.SH').join(','),
      startMs: Date.parse('2016-02-29T00:00:00+08:00'),
      endMs: Date.parse('2026-02-28T00:00:00+08:00'),
    };
    expect(capability.inputSchema.safeParse(input).success).toBe(true);
    expect(capability.inputSchema.safeParse({ ...input, endMs: input.endMs + 1 }).success).toBe(
      false,
    );
  } finally {
    vi.useRealTimers();
  }
});
