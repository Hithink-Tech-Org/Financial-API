import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkbench } from '../src/host/workbench.js';
import { workbenchRemote } from '../src/host/workbench-remote.js';

const day = 86_400_000;
const anchor = Date.UTC(2026, 0, 1);
const output = (command, data, meta = {}) => ({ exitCode: 0, stderr: '',
  stdout: JSON.stringify({ ok: true, command, data, meta: { source: 'remote', ...meta } }) });
const failure = (command, code) => ({ exitCode: 3, stdout: '',
  stderr: JSON.stringify({ ok: false, command, error: { code, message: 'private credential errors', request_id: 'valid-request-id' } }) });

function service(t, run, connected = true) {
  const calls = [];
  const cli = { async run(argv, options) {
    calls.push(argv);
    if (argv[0] === 'auth') return output('auth.status', { connected });
    if (argv[0] === 'schema') return output('schema', {
      id: argv[1], command: argv[1].split('.'), options: [], local_history_coverage: 'trading-calendar',
    });
    assert.equal(argv[0], '--source');
    const command = argv.slice(2, 4).join('.');
    assert.equal(argv[1], command === 'market.history' ? 'auto' : 'remote');
    return run(command, argv.slice(4), options);
  } };
  return { workbench: createWorkbench({ cli, signal: t.signal }), calls };
}

test('only catalog cases can submit their fixed read-only CLI commands', async (t) => {
  const { workbench, calls } = service(t, () => assert.fail('invalid arguments reached the CLI'));
  assert(workbenchRemote.descriptors.some(({ method }) => method === 'liveCase'));
  for (const input of [
    { id: 'template:stock-overview' }, { id: 'market.snapshot' }, { id: 'template:constructor' },
    { id: 'auction-radar', params: { stocks: '--output' } },
    { id: 'auction-radar', params: { stage: 'all' } },
    { id: 'etf-compare', params: { funds: Array(7).fill('510300.SH') } },
    { id: 'fund-dca', params: { base: -50 } }, { id: 'fund-dca', params: { day: 29 } },
    { id: 'etf-compare', params: { 'api-key': 'unsafe' } },
    { id: 'fund-dca', credential: 'unsafe' },
    { id: 'limit-break', params: { date: '2026-02-30' } },
    { id: 'stock-sector-index', params: { stock: '600019.SH', command: 'auth.logout' } },
    { id: 'local-market-panel', params: { stocks: "' OR true --" } },
    { id: 'local-market-panel', params: { sql: 'SELECT 1' } },
    { id: 'local-market-panel', params: { start: '2026-01-01', end: '2026-02-01' } },
  ]) assert.equal((await workbench.liveCase(input)).error.code, 'FINANCE_WORKBENCH_INVALID_QUERY');
  assert.deepEqual(calls, []);
  const disconnected = service(t, () => assert.fail('an unauthenticated request reached data transport'), false);
  assert.equal((await disconnected.workbench.liveCase({ id: 'fund-dca' })).error.code, 'AUTH_LOGIN_REQUIRED');
});

test('ETF deviation uses common sessions and a missing unit NAV remains null', async (t) => {
  const quoteRows = Array.from({ length: 65 }, (_, i) => ({ date_ms: anchor + i * day, close_price: 100 + i }));
  const navRows = quoteRows.slice(2).map((row, i) => ({ nav_date: row.date_ms, unit_nav: i === 62 ? null : 2,
    adj_nav: 200 + 2 * i })).reverse();
  const { workbench } = service(t, (command, options) => {
    if (command === 'index.history') return output(command, { item: quoteRows });
    if (command === 'fund.profile') return output(command, { item: [{ fund_name: '测试基金', rate_info: [
      { rate_type: 'purchase', charge_mode: 'one_off', standard_rate: '0.01%' },
      { rate_type: 'management', charge_mode: 'ongoing', standard_rate: '0.15%', discounted_rate: '0.10%' },
      { rate_type: 'custody', charge_mode: 'ongoing', standard_rate: '0.05%' },
    ] }] });
    assert.deepEqual(options, ['--thscode', '510300.SH', '--range', 'year', '--nav-type', 'unit,adj']);
    return output(command, { item: navRows, timestamp: anchor + 70 * day });
  });
  const { data } = await workbench.liveCase({ id: 'template:etf-compare', params: { funds: ['510300.SH'] } });
  assert.equal(data.rows[0].last, null);
  assert.equal(data.rows[0].change, null);
  assert.equal(data.rows[0].management_fee_pct, 0.15);
  assert(Math.abs(data.rows[0].deviation - ((324 / 204) - (164 / 104)) * 100) < 1e-10);
  assert.equal(data.freshness[0].updated_at, anchor + 64 * day);
  assert(data.freshness[0].fetched_at > data.freshness[0].updated_at);
  assert.equal(data.status, 'partial');
});

test('ETF management percentage is unknown for conditional, fixed, or conflicting rates', async (t) => {
  const rates = [
    [{ rate_type: 'management', charge_mode: 'ongoing', condition: '满 100 万', standard_rate: '0.10%' }],
    [{ rate_type: 'management', charge_mode: 'ongoing', standard_rate: '100元/笔' }],
    ['0.10%', '0.15%'].map((standard_rate) => ({ rate_type: 'management', charge_mode: 'ongoing', standard_rate })),
  ];
  const codes = ['510300.SH', '510330.SH', '159919.SZ'];
  const { workbench } = service(t, (command, options) => output(command, { item: command === 'fund.profile'
    ? [{ rate_info: rates[codes.indexOf(options[1])] }] : [] }));
  const { data } = await workbench.liveCase({ id: 'etf-compare', params: { funds: codes } });
  assert.deepEqual(data.rows.map((row) => row.management_fee_pct), [null, null, null]);
});

test('DCA valuation follows the selected fund while the selected index is the comparator', async (t) => {
  const { workbench, calls } = service(t, (command) => output(command, { item: command === 'fund.indicators-history'
    ? [{ date_ms: anchor, track_index_pe_ttm_five_year_percentile: 19.8 }] : [] }));
  const { data } = await workbench.liveCase({ id: 'fund-dca', params: { fund: '510300.SH', index: '000905.SH' } });
  assert.equal(data.selection.index, '000905.SH');
  assert.equal(data.signal.pe_percentile, 19.8);
  assert.deepEqual(data.signal.valuation_scope, { fund: '510300.SH', source: 'fund.indicators-history', as_of: anchor });
  assert(calls.find((argv) => argv.includes('indicators-history')).includes('510300.SH'));
  assert(calls.find((argv) => argv.includes('index') && argv.includes('history')).includes('000905.SH'));
});

test('a denied market pool leaves derived stats unknown and other sources available', async (t) => {
  const { workbench, calls } = service(t, (command) => {
    if (command === 'special.limit-up-pool') return failure(command, 'FUYAO_2003');
    if (command === 'special.limit-up-ladder') return output(command, { item: [
      { date: '2026-01-06', boards: { two_board: [{ name: '指定日期' }] } },
      { date: '2026-01-05', boards: { two_board: [{ name: '较早日期' }] } },
    ] });
    return output(command, { item: [] });
  });
  const response = await workbench.liveCase({ id: 'limit-break', params: {} });
  assert.equal(response.data.ladder.date, '2026-01-06');
  assert.equal(response.data.stats.up, null);
  assert.equal(response.data.stats.down, 0);
  assert.equal(response.data.stats.break_rate, null);
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.freshness[0].code, 'FUYAO_2003');
  assert.equal(JSON.stringify(response).includes('private credential'), false);
  assert.equal(calls.filter((argv) => argv.includes('--size')).length, 3);
});

test('linkage matches index snapshots by code and separates flat and missing quotes', async (t) => {
  const stock = '600726.SH';
  const sector = '881105.TI';
  const index = '000300.SH';
  const others = ['600001.SH', '600002.SH', '600003.SH'];
  const { workbench } = service(t, (command, options) => {
    if (command === 'market.history') {
      assert.ok(options.includes('none'));
      return output(command, { item: [
        { date_ms: anchor, open_price: 10, high_price: 11, low_price: 9, close_price: 10, volume: 200 },
      ] }, { source: 'local' });
    }
    if (command === 'index.snapshot') return output(command, { item: [
      { thscode: index, price_change_ratio_pct: -1 }, { thscode: sector, price_change_ratio_pct: 0.5 },
    ] });
    if (command === 'index.constituents') return output(command, { item: [stock, ...others].map((thscode) => ({ thscode })) });
    if (command === 'market.snapshot') return output(command, { item: options.includes(stock) ?
      [{ thscode: stock, price_change_ratio_pct: 2 }] : [
        { thscode: stock, price_change_ratio_pct: 2 }, { thscode: others[0], price_change_ratio_pct: 0 },
        { thscode: others[1], price_change_ratio_pct: -0.5 }, { thscode: others[2], price_change_ratio_pct: null },
      ] });
    return output(command, { item: [] });
  });
  const { data } = await workbench.liveCase({ id: 'stock-sector-index', params: { adjust: 'none' } });
  assert.equal(data.quotes.sector.price_change_ratio_pct, 0.5);
  assert.equal(data.quotes.index.price_change_ratio_pct, -1);
  const { leaders, ...breadth } = data.breadth;
  assert.deepEqual(breadth, { sample: 3, rising: 1, falling: 1, flat: 1, missing: 1, requested: 4,
    total: 4, limit: 50, scope: 'first-eligible-constituents', ratio: 33.3 });
  assert.equal(leaders.length, 3);
  assert.equal(data.membership.verified, true);
  assert.equal(data.freshness.find(({ command }) => command === 'market.history').source, 'local');
  assert.equal(data.freshness.find(({ command }) => command === 'index.history').source, 'remote');
  assert.equal(data.selection.adjust, 'none');
  assert.equal(data.bars[0].close, 10);
  assert.equal(data.status, 'partial');
});

test('local market panel works signed out and reports actual records by symbol', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-finance-market-panel-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = join(directory, 'market.duckdb');
  await writeFile(database, '');
  const calls = [];
  const cli = { async run(argv) {
    calls.push(argv);
    if (argv[0] === 'config') return output('config.show', { db_path: database });
    assert.deepEqual(argv.slice(0, 7), ['--db', database, '--source', 'local', 'db', 'query', '--sql']);
    assert.match(argv[7], /raw_kline_daily WHERE thscode IN \('600519\.SH', '000001\.SZ'\)/);
    assert.match(argv[7], /BETWEEN DATE '2026-01-01' AND DATE '2026-01-03'/);
    assert.match(argv[7], /LIMIT 180$/);
    return output('db.query', [{ thscode: '600519.SH', date: '2026-01-02', close: 100 }], { source: undefined });
  } };
  const workbench = createWorkbench({ cli, signal: t.signal });
  const input = { id: 'template:local-market-panel', params: { stocks: '600519.sh, 000001.sz',
    start: '2026-01-01', end: '2026-01-03' } };
  const { data } = await workbench.liveCase(input);
  assert.deepEqual(calls.map(([arg]) => arg), ['config', '--db']);
  assert.equal(data.status, 'partial');
  assert.equal(data.freshness[0].source, 'local');
  assert.deepEqual(data.coverage, [
    { thscode: '600519.SH', days: 1, start: '2026-01-02', end: '2026-01-02' },
    { thscode: '000001.SZ', days: 0, start: null, end: null },
  ]);
  await rm(database);
  const unavailable = await workbench.liveCase(input);
  assert.equal(unavailable.error.code, 'FINANCE_WORKBENCH_LOCAL_UNAVAILABLE');
  assert.deepEqual(calls.map(([arg]) => arg), ['config', '--db', 'config']);
});

test('a broad sector reports limited quote coverage and the full constituent count', async (t) => {
  const members = Array.from({ length: 53 }, (_, i) => ({ thscode: `${600000 + i}.SH` }));
  const { workbench } = service(t, (command, options) => {
    if (command === 'index.constituents') return output(command, { item: members });
    if (command === 'market.snapshot') return output(command, { item: options[1].split(',').map((thscode) =>
      ({ thscode, price_change_ratio_pct: 1 })) });
    return output(command, { item: [] });
  });
  const { data } = await workbench.liveCase({ id: 'stock-sector-index' });
  assert.equal(data.breadth.sample, 50);
  assert.equal(data.breadth.requested, 50);
  assert.equal(data.breadth.total, 53);
  assert.equal(data.breadth.limit, 50);
});

test('hot-stock classification preserves known matches amid an unavailable comparison list', async (t) => {
  const [a, b] = ['000001.SZ', '000002.SZ'];
  const { workbench } = service(t, (command, options) => {
    if (command === 'special.hot-stock' && options.includes('day')) return failure(command, 'FUYAO_2003');
    if (command === 'special.hot-stock') return output(command, { item: [{ thscode: a }, { thscode: b }] });
    if (command === 'special.skyrocket') return output(command, { item: [{ thscode: a }] });
    return output(command, { item: [] });
  });
  const { data } = await workbench.liveCase({ id: 'hot-stock-ranking' });
  assert.deepEqual(data.coverage, { hour: 'ok', day: 'error', rise: 'ok', history: 'empty' });
  assert.deepEqual(data.comparisons, { persistent_count: null, fast_count: 1 });
  assert.deepEqual(data.hour.map(({ persist, fast, classification }) => [persist, fast, classification]),
    [[null, true, 'rising'], [null, false, null]]);
});

test('dragon counts use unique codes while seat rows retain distinct amounts and identities', async (t) => {
  const [a, b, c] = ['000001.SZ', '000002.SZ', '000003.SZ'];
  const { workbench } = service(t, (command, options) => {
    if (command === 'special.anomaly-list') return output(command, { item: [{ thscode: a }, { thscode: a }, { thscode: b }] });
    if (command === 'special.dragon-tiger') return output(command, {
      stock_items: [], trade_date: '2026-01-06',
      hot_money_items: [
        { id: 14, name: '席位甲', rows: [{ thscode: a, hot_money_net_value: 110, hot_money_item_net_value: -20 },
          { thscode: c, hot_money_item_net_value: 15 }] },
        { name: '席位乙', rows: [{ thscode: a, hot_money_net_value: 110, hot_money_item_net_value: -30 }] },
      ],
    });
    return output(command, { item: options[1].split(',').map((thscode) => ({ thscode })) });
  });
  const { data } = await workbench.liveCase({ id: 'dragon-tiger-anomalies', params: { board: 'hot_money' } });
  assert.equal(data.anomaly_count, 3);
  assert.deepEqual(data.stock_counts, { anomaly: 2, dragon: 2, matched: 1, org_positive: null, hot_money_positive: 0 });
  assert.deepEqual(data.dragon.filter((row) => row.thscode === a).map((row) =>
    [row.seat_id, row.seat_name, row.hot_money_item_net_value]), [[14, '席位甲', -20], [null, '席位乙', -30]]);
});

test('closing a live case cancels active CLI requests and skips queued commands', async (t) => {
  const controller = new AbortController();
  const started = Promise.withResolvers();
  let active = 0;
  const { workbench, calls } = service(t, (_command, _argv, { signal }) => new Promise((resolve) => {
    active += 1;
    if (active === 4) started.resolve();
    signal.addEventListener('abort', () => {
      active -= 1;
      resolve({ exitCode: 1, stdout: '', stderr: '' });
    }, { once: true });
  }));
  const request = workbench.liveCase({ id: 'fund-dca' }, controller.signal);
  await started.promise;
  controller.abort();
  assert.equal((await request).error.code, 'FINANCE_CANCELLED');
  assert.equal(active, 0);
  assert.equal(calls.filter((argv) => argv[0] === '--source').length, 4);
});
