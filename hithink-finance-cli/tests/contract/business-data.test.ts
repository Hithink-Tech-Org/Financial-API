import { createServer } from 'node:http';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import { remoteCapabilities } from '../../src/contracts/remote-capabilities.js';

const routes = [
  [
    'special',
    'limit-up-statistics',
    '/api/a-share/special-data/limit-up-statistics',
    ['--date', '2026-10-12'],
    { date: '2026-10-12' },
  ],
  [
    'special',
    'dragon-tiger-stock-institution',
    '/api/a-share/special-data/dragon-tiger-stock-institution',
    ['--thscode', '600519.SH', '--range-days', '3'],
    { thscode: '600519.SH', range_days: '3' },
  ],
  [
    'special',
    'dragon-tiger-department-classic-record',
    '/api/a-share/special-data/dragon-tiger-department-classic-record',
    ['--department-id', 'abc'],
    { department_id: 'abc' },
  ],
  [
    'special',
    'dragon-tiger-department-history',
    '/api/a-share/special-data/dragon-tiger-department-history',
    [
      '--department-id',
      'abc',
      '--page',
      '2',
      '--min-net-buy-amount',
      '5000000',
      '--sort-field',
      'change_ratio',
      '--sort-dir',
      'asc',
    ],
    {
      department_id: 'abc',
      page: '2',
      size: '30',
      min_net_buy_amount: '5000000',
      sort_field: 'change_ratio',
      sort_dir: 'asc',
    },
  ],
  [
    'special',
    'abnormal-monitor',
    '/api/a-share/special-data/abnormal-monitor-list',
    ['--state', 'history', '--page', '2'],
    { state: 'history', page: '2', size: '30' },
  ],
  [
    'special',
    'auction-opportunities',
    '/api/a-share/special-data/auction-stock-opportunities',
    [
      '--date',
      '2026-10-12',
      '--warn-types',
      '68710,68727',
      '--exclude-st',
      'true',
      '--thscodes',
      '600519.SH',
      '--sort-by',
      'warn_type',
      '--sort-order',
      'asc',
    ],
    {
      date: '2026-10-12',
      warn_types: '68710,68727',
      market: 'a_share',
      exclude_st: 'true',
      thscodes: '600519.SH',
      sort_by: 'warn_type',
      sort_order: 'asc',
      page: '1',
      size: '20',
    },
  ],
  [
    'special',
    'auction-opportunity-dates',
    '/api/a-share/special-data/auction-opportunity-dates',
    [],
    {},
  ],
  [
    'ipo',
    'a-share-calendar',
    '/api/a-share/ipo/calendar-list',
    ['--market', 'bj', '--status', 'subscribable'],
    { market: 'bj', status: 'subscribable' },
  ],
  ['ipo', 'hk-applications', '/api/hk-share/ipo/application-list', ['--page', '2'], { page: '2' }],
  [
    'ipo',
    'hk-calendar',
    '/api/hk-share/ipo/calendar-list',
    ['--status', 'awaiting_listing'],
    { status: 'awaiting_listing' },
  ],
  [
    'ipo',
    'hk-issue-detail',
    '/api/hk-share/ipo/issue-detail',
    ['--issue-code', 'HK2636'],
    { issue_code: 'HK2636' },
  ],
  [
    'special',
    'skyrocket',
    '/api/a-share/special-data/skyrocket-list',
    ['--limit', '100'],
    { period: 'day', limit: '100' },
  ],
  [
    'special',
    'hot-stock',
    '/api/a-share/special-data/hot-stock-list',
    [],
    { period: 'day', limit: '30' },
  ],
] as const;

test('maps all IPO commands to their distinct REST endpoints', () => {
  expect(
    remoteCapabilities
      .filter((c) => c.command[0] === 'ipo')
      .map((c) => [c.id, c.command.join(' '), c.endpoint]),
  ).toEqual([
    ['ipo.a-share-calendar', 'ipo a-share-calendar', '/api/a-share/ipo/calendar-list'],
    ['ipo.hk-applications', 'ipo hk-applications', '/api/hk-share/ipo/application-list'],
    ['ipo.hk-calendar', 'ipo hk-calendar', '/api/hk-share/ipo/calendar-list'],
    ['ipo.hk-issue-detail', 'ipo hk-issue-detail', '/api/hk-share/ipo/issue-detail'],
  ]);
});

test.each(routes)(
  '%s %s maps parameters and preserves nullable records',
  async (group, command, endpoint, args, query) => {
    const requests: string[] = [];
    const data = {
      timestamp: 1,
      item: [
        { thscode: null, name: '' },
        { thscode: '', name: null },
      ],
      pagination: { page: 2, size: 30, total: null, has_next: true },
    };
    const server = createServer((req, res) => {
      requests.push(req.url ?? '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: 0, message: 'ok', request_id: 'bounded-fixture', data }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('fixture unavailable');
      const result = await execa(
        'node',
        ['dist/cli/main.js', group, command, ...args, '--format', 'json'],
        {
          env: {
            HITHINK_FINANCE_API_KEY: 'fixture-key',
            HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${address.port}`,
            HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
          },
        },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        command: `${group}.${command}`,
        data,
      });
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0]!, 'http://fixture');
      expect(url.pathname).toBe(endpoint);
      expect(Object.fromEntries(url.searchParams)).toEqual(query);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test.each([
  ['special.skyrocket', { limit: 101 }],
  ['special.hot-stock', { limit: 0 }],
  ['special.dragon-tiger-stock-institution', { thscode: '600519.SH', rangeDays: '2' }],
  ['special.dragon-tiger-department-history', { departmentId: 'abc', size: 31 }],
  ['special.dragon-tiger-department-history', { departmentId: 'abc', minNetBuyAmount: 1 }],
  ['special.abnormal-monitor', { state: 'other' }],
  ['special.auction-opportunities', { warnTypes: '68728' }],
  ['special.auction-opportunities', { size: 21 }],
  ['special.auction-opportunities', { page: 2147483648 }],
  ['special.auction-opportunities', { date: '2026-02-30' }],
  ['special.auction-opportunities', { thscodes: Array(51).fill('600519.SH').join(',') }],
  ['ipo.a-share-calendar', { market: 'hk', status: 'upcoming' }],
  ['ipo.hk-calendar', { status: 'upcoming' }],
  ['ipo.hk-issue-detail', { issueCode: '' }],
] as const)('%s rejects invalid input before HTTP', (id, input) => {
  const capability = remoteCapabilities.find((c) => c.id === id);
  expect(capability).toBeDefined();
  expect(capability!.inputSchema.safeParse(input).success).toBe(false);
});

test('restricted business data is absent from public capability routing', () => {
  for (const endpoint of [
    '/api/a-share/special-data/turnover-prediction-snapshot',
    '/api/fund/etf-flow/net-inflow-historical',
    '/api/a-share/special-data/chip-shape-dates',
    '/api/a-share/special-data/chip-shape-stocks',
    '/api/a-share-index/baseinfo/new-concepts',
  ]) {
    expect(remoteCapabilities.some((c) => c.endpoint === endpoint)).toBe(false);
  }
});

test.each(
  ['special.dragon-tiger-department-history', 'special.abnormal-monitor'].flatMap((id) => [
    [id, 2] as const,
    [id, null] as const,
  ]),
)(
  '%s preserves nullable records and total %s while requiring pagination structure',
  (id, total) => {
    const schema = remoteCapabilities.find((c) => c.id === id)!.outputSchema;
    const response = {
      item: [
        { thscode: null, name: '' },
        { thscode: '', name: null },
      ],
      pagination: { page: 1, size: 30, total, has_next: false },
    };
    expect(schema.parse(response)).toEqual(response);
    expect(schema.safeParse({ item: [{}], pagination: response.pagination }).success).toBe(false);
    expect(schema.safeParse({ item: response.item }).success).toBe(false);
    for (const invalidTotal of ['2', 1.5, undefined]) {
      expect(
        schema.safeParse({
          ...response,
          pagination: { ...response.pagination, total: invalidTotal },
        }).success,
      ).toBe(false);
    }
  },
);
