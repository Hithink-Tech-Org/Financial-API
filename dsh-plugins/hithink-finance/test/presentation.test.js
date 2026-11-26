import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPresentation, historyValues, shanghaiDay, shanghaiTime } from '../src/presentation/index.js';
import { klineTime, pricePrecision, recentKlineRange, validCandle } from '../src/presentation/kline.js';
import { cardContext, chartData, displayField, formatValue } from '../src/presentation/render.js';

test('snapshot uses the batch timestamp, percentages as supplied, and preserves null rows', () => {
  const timestamp = Date.parse('2026-09-30T07:00:21Z');
  const view = buildPresentation({
    ok: true, op: 'run', capability: 'market.snapshot', params: { thscodes: '600000.SH,000001.SZ' },
    data: { timestamp, total: 5570, item: [
      { thscode: '600000.SH', last_price: 10.12, price_change_ratio_pct: 1.2 },
      { thscode: null, last_price: 19, price_change_ratio_pct: null, ticker: '000001' },
    ] },
  });
  assert.equal(view.kind, 'snapshot');
  assert.equal(view.asOf, timestamp);
  assert.equal(shanghaiTime(timestamp), '2026-09-30 15:00:21');
  assert.equal(shanghaiTime(null), null);
  assert.deepEqual(view.rows, [
    { thscode: '600000.SH', lastPrice: 10.12, changePct: 1.2 },
    { thscode: null, lastPrice: 19, changePct: null },
  ]);
  assert.deepEqual(view.missing, ['000001.SZ']);
  assert.equal(view.pagination.total, 5570);
});

const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'];
const date = (index) => Date.parse(`${dates[index]}T00:00:00+08:00`);
const bar = (index, close_price) => ({ date_ms: date(index), close_price });
const historyResult = {
  ok: true, op: 'run', capability: 'market.history-batch',
  params: { thscodes: '600000.SH,000001.SZ,600001.SH', 'start-ms': date(0), 'end-ms': date(5) },
  tradingDates: dates, display: 'daily-change',
  data: { interval: '1d', adjust: 'forward', item: [
    { thscode: '600000.SH', timestamp: date(5), item: [bar(5, 105), bar(0, 100), bar(1, 110), bar(3, 101), bar(4, 0)] },
    { thscode: '000001.SZ', timestamp: null, item: [] },
  ] },
};

test('daily return needs adjacent trading dates and an actual nonzero prior close', () => {
  const view = buildPresentation(historyResult);
  assert.equal(view.adjust, 'forward');
  assert.equal(view.displayedMetric, 'daily-change');
  assert.equal(view.start, dates[0]);
  assert.equal(view.end, dates[5]);
  assert.equal(shanghaiDay(date(0)), '2026-11-16');
  assert.equal(shanghaiTime(view.series[0].asOf), '2026-11-23 00:00:00');
  assert.equal(view.returned, 5);
  assert.deepEqual(view.series[0].close, [100, 110, null, 101, 0, 105]);
  assert.deepEqual(view.missing, ['600001.SH']);
  const daily = historyValues(view, 'daily-change');
  assert.deepEqual(daily.dates, dates.slice(1));
  assert.deepEqual(daily.series[0].values.map((value) => value == null ? value : Math.round(value)),
    [10, null, null, -100, null]);
  assert.deepEqual(daily.series[1].values, [null, null, null, null, null]);
  const cumulative = historyValues(view, 'cumulative-return');
  assert.deepEqual(cumulative.series[0].values.map((value) => value == null ? value : Math.round(value)),
    [0, 10, null, 1, -100, 5]);
});

test('incomplete calendars fall back to actual closes without calculating daily changes', () => {
  const view = buildPresentation({ ...historyResult, tradingDates: dates.slice(1) });
  assert.equal(view.calendar, false);
  const result = historyValues(view, 'daily-change');
  assert.equal(result.metric, 'close');
  assert.deepEqual(result.dates, [dates[0], dates[1], dates[3], dates[4], dates[5]]);
  assert.deepEqual(result.series[0].values, [100, 110, 101, 0, 105]);
});

test('generic previews and result references keep counts and pagination replayable', () => {
  const view = buildPresentation({
    ok: true, op: 'run', capability: 'symbol.search',
    data: { item: Array.from({ length: 30 }, (_, index) => ({ name: `name ${index}`, thscode: null })) },
    summary: { total: 40, page: 1, has_more: true },
    resultRef: { path: 'D:/workspace/result.json', rows: 30 },
  });
  assert.equal(view.kind, 'table');
  assert.equal(view.returned, 30);
  assert.equal(view.rows.length, 20);
  assert.deepEqual(view.rows[0], ['name 0', null]);
  assert.equal(view.pagination.hasMore, true);
  assert.equal(view.pagination.total, 40);
  assert.equal(view.resultPath, 'D:/workspace/result.json');
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});

test('CLI daily bars preserve OHLC order, volume, Shanghai dates and missing values', () => {
  const view = { template: 'kline', rows: [
    { date_ms: date(3), thscode: '600000.SH', open_price: 10, close_price: 11, low_price: 9, high_price: 12, volume: 80 },
    { date_ms: date(2), thscode: '600000.SH', open_price: 10, close_price: null, low_price: 8, high_price: 12, volume: 0 },
    { date_ms: date(2), thscode: '000001.SZ', open_price: 13, close_price: 14, low_price: 11, high_price: 14, volume: 40 },
  ], fields: [] };
  const chart = chartData(view);
  assert.deepEqual(chart.groups.get('600000.SH'), [
    { time: date(2) / 1000, date: dates[2], values: [10, null, 8, 12], volume: 0 },
    { time: date(3) / 1000, date: dates[3], values: [10, 11, 9, 12], volume: 80 },
  ]);
  assert.deepEqual(chart.groups.get('000001.SZ')[0].values, [13, 14, 11, 14]);
  assert.equal(chart.volume.label, '成交量');
});

test('financial chart normalizes Shanghai dates and preserves distinct timestamps', () => {
  const beforeMidnight = Date.parse('2026-11-23T16:01:00Z');
  assert.deepEqual(klineTime(beforeMidnight, 'date'), {
    time: Date.parse('2026-11-23T16:00:00Z') / 1000, date: '2026-11-24',
  });
  assert.deepEqual(klineTime('2026-11-24 09:35', 'datetime'), klineTime('2026-11-24T01:35:00Z', 'datetime'));
  assert.deepEqual(klineTime('20261124', 'date'), klineTime('2026-11-24', 'date'));
  assert.deepEqual(klineTime(20261124, 'auto'), klineTime('2026-11-24', 'date'));
  assert.equal(klineTime('2026-02-30', 'date'), null);
  assert.equal(klineTime(20260230, 'date'), null);
  assert.equal(klineTime('不明日期', 'date'), null);
  const row = { open: 0, high: 0.001235, low: 0, close: 0.00000085, volume: 0 };
  const view = { template: 'kline', x: 'timestamp', fields: [], rows: [
    { ...row, timestamp: '2026-11-24 09:36' }, { ...row, timestamp: '2026-11-24 09:35' },
  ] };
  const bars = chartData(view).groups.get('');
  assert.deepEqual(bars.map(({ date }) => date), ['2026-11-24 09:35:00', '2026-11-24 09:36:00']);
  assert.equal(pricePrecision(bars), 8);
  assert.ok(validCandle(bars[0]));
  assert.equal(validCandle({ values: [0, null, 0, 1] }), false);
  assert.equal(validCandle({ values: [2, 3, 0, 2] }), false);
  assert.match(chartData({ ...view, fields: [{ key: 'timestamp', format: 'date' }] }).reason, /重复坐标/);
  assert.deepEqual(recentKlineRange(22, 20), { from: 1.5, to: 21.5 });
  assert.deepEqual(recentKlineRange(72, 60), { from: 11.5, to: 71.5 });
});

test('chart models leave ambiguous groups and duplicate dates for the original records table', () => {
  const point = { date_ms: date(0), thscode: '600000.SH', open_price: 10, close_price: 11, low_price: 9, high_price: 12 };
  for (const template of ['kline', 'line']) {
    const ambiguous = { template, fields: [], rows: [point, { ...point, thscode: null }, { ...point, thscode: null }] };
    assert.match(chartData(ambiguous).reason, /缺少分组标识/);
    assert.equal(ambiguous.rows.length, 3);
    assert.match(chartData({ ...ambiguous, rows: [point, { ...point, close_price: 19 }] }).reason, /重复坐标/);
    assert.match(chartData({ ...ambiguous, rows: [point, { ...point, date_ms: null }] }).reason, /缺少有效坐标/);
    const distinct = chartData({ ...ambiguous, rows: [point, { ...point, thscode: '000001.SZ' }] });
    assert.equal(template === 'kline' ? distinct.groups.size : distinct.plots.length, 2);
  }
});

test('table, grouped series, and K lines share Shanghai dates for mixed trading-date representations', () => {
  const field = { format: 'date' };
  const epoch = Date.parse('2026-11-24T16:01:00Z');
  const scalars = [20261125, ' 20261125 ', '2026-11-25', epoch, String(epoch), '2026-11-24T16:01:00Z'];
  for (const value of scalars) {
    assert.equal(formatValue(value, field), '2026-11-25');
    assert.deepEqual(klineTime(value, field.format), { time: Date.parse('2026-11-24T16:00:00Z') / 1000, date: '2026-11-25' });
  }
  for (const value of [20260230, '20260230', '2026-02-30', '2026-11-25T24:00:00+08:00', '不明日期', null, '', {}, Infinity]) {
    assert.equal(formatValue(value, field), '—');
    assert.equal(klineTime(value, field.format), null);
  }
  assert.equal(formatValue(0, field), '1970-01-01');
  assert.equal(formatValue('20240229', field), '2024-02-29');
  assert.equal(formatValue('20261125', { format: 'auto' }), '20261125');
  assert.equal(formatValue('2026-11-25 09:30', { format: 'datetime' }), '2026-11-25 09:30:00');
  assert.equal(formatValue(epoch, { format: 'datetime' }), '2026-11-25 00:01:00');

  const bar = (trade_date, thscode, close_price) => ({ trade_date, thscode, close_price, open_price: 1, low_price: 0, high_price: 30 });
  const rows = [bar(20261125, 'A', 13), bar('20261124', 'B', 21), bar('2026-11-23T16:01:00Z', 'A', 11), bar(epoch, 'B', 23)];
  const line = { template: 'line', x: 'trade_date', fields: [], rows };
  const candles = { ...line, template: 'kline' };
  const grouped = chartData(line);
  assert.deepEqual(grouped.labels, ['2026-11-24', '2026-11-25']);
  assert.deepEqual(Object.fromEntries(grouped.plots.map(({ name, values }) => [name, values])), { A: [11, 13], B: [21, 23] });
  for (const bars of chartData(candles).groups.values()) assert.deepEqual(bars.map(({ date }) => date), grouped.labels);
  for (const view of [line, candles]) {
    assert.match(chartData({ ...view, rows: [...rows, bar('20261125', 'A', 9)] }).reason, /重复坐标/);
    assert.match(chartData({ ...view, rows: [...rows, bar(20260230, 'A', 9)] }).reason, /缺少有效坐标/);
  }
});

test('financial sequences sort report periods and preserve currency and percentage scale', () => {
  const view = { template: 'financial', rows: [
    { period_end_ms: date(3), currency: 'CNY', operating_income: 200000000, net_profit: null },
    { period_end_ms: date(2), currency: 'CNY', operating_income: 100000000, net_profit: -20000 },
  ], fields: [] };
  const chart = chartData(view);
  assert.deepEqual(chart.labels, [dates[2], dates[3]]);
  assert.deepEqual(chart.plots.map(({ values }) => values), [[100000000, 200000000], [-20000, null]]);
  assert.equal(formatValue(100000000, chart.plots[0].field, true), '1亿 CNY');
  assert.equal(formatValue(1.23, { format: 'percent' }), '1.23%');
  assert.equal(formatValue(0.0123, { format: 'ratio' }), '1.23%');
  assert.equal(formatValue('000001', { format: 'auto' }), '000001');
  assert.equal(formatValue(null, { format: 'currency' }), '—');
  assert.equal(formatValue('2026-11-20T18:00:00Z', { format: 'date' }), '2026-11-21');
  const mixed = { ...view, rows: [view.rows[0], { ...view.rows[1], currency: 'USD' }] };
  assert.equal(displayField('operating_income', mixed).unit, undefined);
  assert.equal(chartData(mixed), null);
});

test('ranking keeps selected holding amounts on the supplied percentage scale and retains matching rows', () => {
  const chart = chartData({ template: 'ranking', fields: [], rows: [
    { stock_name: '甲', hold_ratio: 6.82 }, { stock_name: '乙', hold_ratio: 3.13 }, { stock_name: '乙', hold_ratio: null },
  ] });
  assert.deepEqual(chart.labels, ['甲', '乙', '乙']);
  assert.deepEqual(chart.plots[0].values, [6.82, 3.13, null]);
  assert.equal(formatValue(chart.plots[0].values[0], chart.plots[0].field), '6.82%');
});

test('card context displays supplied time, adjustments, period and measurement basis', () => {
  assert.equal(cardContext({ asOf: Date.parse('2026-11-24T07:00:00Z'), adjust: 'forward', interval: '1d', subtitle: '价格 CNY，成交量 股' }),
    '数据时点 2026-11-24 15:00:00（上海时间） · 日线 · 前复权 · 价格 CNY，成交量 股');
  assert.equal(cardContext({ asOf: '2026-11-24 收盘' }), '数据时点 2026-11-24 收盘');
  assert.equal(cardContext({}), '');
});
