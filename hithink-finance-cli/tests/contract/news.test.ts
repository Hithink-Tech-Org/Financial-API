import { createServer } from 'node:http';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import { remoteCapabilities } from '../../src/contracts/remote-capabilities.js';

const routes = [
  [
    'article-detail',
    '/api/news/article/detail',
    ['--client-type', 'web', '--encoded-seq', 'opaque?x=1'],
    { client_type: 'web', encoded_seq: 'opaque?x=1' },
  ],
  [
    'flash-list',
    '/api/news/flash/list',
    ['--tag-id', '1', '--seq', '9007199254740993'],
    { tag_id: '1', seq: '9007199254740993' },
  ],
  [
    'flash-refresh',
    '/api/news/flash/refresh',
    ['--tag-id', '1', '--seq', '9223372036854775807', '--create-time-ms', '1792022400000'],
    { tag_id: '1', seq: '9223372036854775807', create_time_ms: '1792022400000' },
  ],
  [
    'notice-detail',
    '/api/news/notice/detail',
    ['--seq', 'notice-opaque'],
    { seq: 'notice-opaque' },
  ],
  [
    'topic-hot-list',
    '/api/news/topic/hot-list',
    ['--tab-id', '1', '--cursor', 'next+/=', '--important-only', 'true'],
    { tab_id: '1', cursor: 'next+/=', limit: '10', important_only: 'true' },
  ],
  [
    'anomaly-analysis',
    '/api/news/anomaly/analysis',
    ['--begin-date', '2020-01-01', '--end-date', '2026-10-16', '--thscode', 'upstream-code'],
    { begin_date: '2020-01-01', end_date: '2026-10-16', thscode: 'upstream-code' },
  ],
  [
    'stock-timeline-list',
    '/api/news/stock/timeline-list',
    ['--thscode', '300033.SZ', '--offset', 'first'],
    { thscode: '300033.SZ', offset: 'first' },
  ],
] as const;

const flash = {
  id: '9007199254740993',
  seq: '9223372036854775807',
  title: '快讯',
  encoded_url: 'https://example.com/a',
  summary: null,
  tags: [{ id: 1, name: '栏目' }],
  type: 1,
  create_time_ms: 1000,
  update_time_ms: 2000,
};
const responses: Record<string, unknown> = {
  'article-detail': {
    encoded_seq: 'opaque?x=1',
    title: '资讯',
    author: null,
    summary: null,
    content: '<p>正文</p>',
    source: null,
    publish_time_ms: 1000,
    is_kuaixun: false,
  },
  'flash-list': { items: [flash, { ...flash, id: '2', seq: '2' }] },
  'flash-refresh': { items: [flash, { ...flash, id: '2', seq: '2' }] },
  'notice-detail': {
    seq: 'notice-opaque',
    title: '公告',
    guid: null,
    report_period: null,
    summary: { notice_type: 'report', items: [{ title: '解读', content: '<p>内容</p>' }] },
    monthly_report_interpretation: {
      notice_type: 'monthly',
      has_findings: false,
      findings: [],
      summary_html: '<p>摘要</p>',
    },
  },
  'topic-hot-list': {
    items: [
      { id: '9007199254740993', title: '专题', url: 'https://example.com/topic', cover: null },
    ],
    next_cursor: 'next+/=',
    has_more: true,
  },
  'anomaly-analysis': {
    items: [
      {
        analysis_id: 'analysis',
        link_url: 'https://example.com/a',
        create_time: 123,
        last_anomaly_time: null,
      },
    ],
    was_truncated: true,
  },
  'stock-timeline-list': {
    items: [
      {
        id: '9007199254740993',
        title: '新闻',
        jump_url: 'https://example.com/a',
        author: null,
        summary: null,
      },
    ],
    has_more: true,
    offset: 'next+/=',
  },
};

test.each(routes)(
  'news %s sends one exact query and preserves data',
  async (command, endpoint, args, query) => {
    const calls: URL[] = [];
    const data = responses[command];
    const server = createServer((request, response) => {
      calls.push(new URL(request.url!, 'http://localhost'));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ code: 0, message: 'success', request_id: 'test', data }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const result = await execa(
        process.execPath,
        ['dist/cli/main.js', 'news', command, ...args, '--format', 'json'],
        {
          env: {
            HITHINK_FINANCE_API_KEY: 'test-key',
            HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${address.port}`,
            HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
          },
        },
      );
      expect(JSON.parse(result.stdout).data).toEqual(data);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.pathname).toBe(endpoint);
      expect(Object.fromEntries(calls[0]!.searchParams)).toEqual(query);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test.each([
  ['news.article-detail', { clientType: 'mobile', encodedSeq: 'id' }],
  ['news.article-detail', { clientType: 'WEB', encodedSeq: '../id' }],
  ['news.flash-list', { tagId: 1, seq: '9223372036854775808' }],
  ['news.flash-list', { tagId: 1, seq: '1.0' }],
  ['news.flash-refresh', { tagId: 1, seq: '0', createTimeMs: 1001 }],
  ['news.topic-hot-list', { tabId: 1, limit: 11 }],
  ['news.anomaly-analysis', { beginDate: '2026-02-30', endDate: '2026-10-16' }],
  ['news.anomaly-analysis', { beginDate: '2026-10-16', endDate: '2026-10-15' }],
  ['news.stock-timeline-list', { thscode: ' ', offset: 'first' }],
  ['news.stock-timeline-list', { thscode: '300033', offset: 'first' }],
  ['news.stock-timeline-list', { thscode: '300033.SZ,600519.SH', offset: 'first' }],
  ['news.stock-timeline-list', { thscode: '300033.SZ', offset: 'first', size: 101 }],
  [
    'news.stock-timeline-list',
    { thscode: '300033.SZ', marketId: '33', code: '300033', offset: 'first' },
  ],
])('%s rejects invalid input', (id, input) => {
  const capability = remoteCapabilities.find((candidate) => candidate.id === id)!;
  expect(capability.inputSchema.safeParse(input).success).toBe(false);
});

test('news discovery contains exactly the seven public routes', () => {
  expect(
    remoteCapabilities
      .filter((capability) => capability.command[0] === 'news')
      .map((capability) => [capability.id, capability.command.join(' '), capability.endpoint]),
  ).toEqual([
    ['news.article-detail', 'news article-detail', '/api/news/article/detail'],
    ['news.flash-list', 'news flash-list', '/api/news/flash/list'],
    ['news.flash-refresh', 'news flash-refresh', '/api/news/flash/refresh'],
    ['news.notice-detail', 'news notice-detail', '/api/news/notice/detail'],
    ['news.topic-hot-list', 'news topic-hot-list', '/api/news/topic/hot-list'],
    ['news.anomaly-analysis', 'news anomaly-analysis', '/api/news/anomaly/analysis'],
    ['news.stock-timeline-list', 'news stock-timeline-list', '/api/news/stock/timeline-list'],
  ]);
  expect(
    remoteCapabilities.some((capability) => capability.endpoint === '/api/news/events/search'),
  ).toBe(false);
});
