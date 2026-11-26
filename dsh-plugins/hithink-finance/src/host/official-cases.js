import { createOfficialCaseData, day, midnight, number, ordered, shanghaiDate, timestamp } from './official-case-data.js';
import { invalidQuery, isRecord } from './workbench-data.js';

const ticker = /^[a-z0-9]{1,12}\.[a-z0-9]{1,8}$/i;
const code = (value) => typeof value === 'string' && ticker.test(value);
const unique = (values) => [...new Set(values)];
const amount = (value) => {
  const amountValue = number(value);
  return amountValue !== null && amountValue >= 1 && amountValue <= 10_000_000;
};
const planDay = (value) => Number.isInteger(number(value)) && number(value) >= 1 && number(value) <= 28;
const choice = (...values) => (value) => values.includes(value);
const codeList = (max) => (value) => {
  if (typeof value === 'string' && value.length > 24 * max) return false;
  const list = typeof value === 'string' ? value.split(',').map((entry) => entry.trim()) : value;
  return Array.isArray(list) && list.length > 0 && list.length <= max && list.every(code);
};
const panelCodes = (value) => typeof value === 'string' && codeList(6)(value) &&
  selectedCodes(value).every((entry) => /^\d{6}\.(?:SH|SZ|BJ)$/.test(entry));
const panelDate = (value, now) => {
  const time = midnight(value);
  return Number.isFinite(time) && shanghaiDate(time) === value && time <= now;
};
const date = (value, now) => {
  const time = midnight(value);
  return Number.isFinite(time) && shanghaiDate(time) === value && time <= now && time >= now - 366 * day;
};
const indexDefault = '000300.SH';
const fundDefault = '510300.SH';
const auctionDefaults = '600519.SH,300750.SZ,000858.SZ,601318.SH';
const etfDefaults = '510300.SH,510330.SH,159919.SZ';
const byCode = (rows) => new Map(rows.filter((row) => code(row.thscode)).map((row) => [row.thscode.toUpperCase(), row]));
const requestCodes = (rows, max) => unique(rows.map((row) => row.thscode).filter(code).map((entry) => entry.toUpperCase())).slice(0, max);
const selectedCodes = (value) => unique((typeof value === 'string' ? value.split(',') : value).map((entry) => entry.trim().toUpperCase()));
const snapshotTime = (data) => data.timestamp;
const rowTime = (field) => (_data, rows) => ordered(rows, field).at(-1)?.[field];
const dateTime = (field) => (data) => midnight(data[field]);
const seriesColors = ['#ff6b4a', '#57a7ff', '#9b7bff', '#22c98b', '#f3bd4d', '#ef6fa9'];
const historyRange = (now, days) => ({ 'start-ms': now - days * day, 'end-ms': now });
const historyTime = { date: rowTime('date_ms') };
const quoteTime = { date: snapshotTime };
const memberSampleLimit = 50;

function combineCodeCoverage({ rows, receipt }, codes, mark) {
  if (rows.length === 0) return;
  const found = byCode(rows);
  const missing = codes.filter((value) => !found.has(value));
  if (missing.length) mark(receipt, 'partial', `未返回 ${missing.join('、')} 的记录。`);
}

function bars(rows) {
  return ordered(rows, 'date_ms').map((row) => ({
    timestamp: Number(row.date_ms), open: number(row.open_price), high: number(row.high_price),
    low: number(row.low_price), close: number(row.close_price), volume: number(row.volume), turnover: number(row.turnover),
  })).filter((row) => row.close > 0);
}

function fundNav({ rows, receipt }, mark) {
  const dated = ordered(rows, 'nav_date');
  const closeField = dated.some((row) => number(row.adj_nav) > 0) ? 'adj_nav' : 'unit_nav';
  const history = dated.map((row) => ({ timestamp: Number(row.nav_date), close: number(row[closeField]) })).filter((row) => row.close > 0);
  const last = number(dated.at(-1)?.unit_nav);
  const prior = number(dated.at(-2)?.unit_nav);
  if (rows.length && (history.length < rows.length || closeField === 'unit_nav' || last === null)) {
    mark(receipt, 'partial', closeField === 'unit_nav' && history.length
      ? '复权净值缺失，曲线使用单位净值。' : '部分净值或净值日期缺失。');
  }
  return { history, snapshot: { last_price: last, price_change_ratio_pct: last > 0 && prior > 0 ? (last / prior - 1) * 100 : null } };
}

function historyBars({ rows, receipt }, mark) {
  const history = bars(rows);
  if (history.length < rows.length) mark(receipt, 'partial', '部分日线收盘或日期缺失。');
  return history;
}

function series(name, color, rows) {
  const first = rows[0]?.close;
  return { name, color, data: first ? rows.map(({ timestamp, close }) => ({ timestamp, value: +(close / first * 100).toFixed(2) })) : [] };
}

function pairedDeviation(fund, index) {
  const benchmark = new Map(index.map((record) => [record.timestamp, record.close]));
  const shared = [...new Map(fund.filter((record) => benchmark.has(record.timestamp))
    .map((record) => [record.timestamp, record])).values()];
  const start = shared.at(-61);
  const end = shared.at(-1);
  return start ? (end.close / start.close - benchmark.get(end.timestamp) / benchmark.get(start.timestamp)) * 100 : null;
}

function managementFee(rates) {
  if (!Array.isArray(rates)) return null;
  const values = rates.filter((rate) => rate?.rate_type === 'management' && rate.charge_mode === 'ongoing' &&
    (rate.condition == null || (typeof rate.condition === 'string' && !rate.condition.trim())))
    .map((rate) => typeof rate.standard_rate === 'string'
      ? number(/^(\d+(?:\.\d+)?)\s*[%％]$/.exec(rate.standard_rate.trim())?.[1]) : null);
  const distinct = unique(values);
  return distinct.length === 1 ? distinct[0] : null;
}

function poolCount(result) {
  if (!result.data) return null;
  const count = number(result.data.pagination?.total);
  return Number.isSafeInteger(count) && count >= result.rows.length ? count : result.rows.length;
}

async function fundDca({ read, mark }, params, now) {
  const fund = params.fund?.toUpperCase() ?? fundDefault;
  const index = params.index?.toUpperCase() ?? indexDefault;
  const fundArgs = { thscode: fund };
  const range = historyRange(now, 380);
  const [nav, indexQuote, candles, profile, returns, indicators, drawdowns, allocation] = await Promise.all([
    read('fund.nav', 'ETF 净值', { ...fundArgs, range: 'year', 'nav-type': 'unit,adj' }, { date: rowTime('nav_date') }),
    read('index.snapshot', '指数行情快照', { thscodes: index }, quoteTime),
    read('index.history', '指数日线', { thscode: index, ...range }, historyTime),
    read('fund.profile', '基金资料', fundArgs),
    read('fund.returns', '基金区间收益', fundArgs),
    read('fund.indicators-history', '基金估值与净值指标', { ...fundArgs, ...range }, historyTime),
    read('fund.drawdowns', '基金区间回撤', fundArgs),
    read('fund.asset-allocation', '基金资产配置', fundArgs, { date: rowTime('report_date_ms') }),
  ]);
  const { history: fundBars, snapshot } = fundNav(nav, mark);
  const indexBars = historyBars(candles, mark);
  const closes = indexBars.map((row) => row.close);
  const last = closes.at(-1) ?? null;
  const peak = closes.length ? Math.max(...closes.slice(-250)) : null;
  const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20 : null;
  const indicator = ordered(indicators.rows, 'date_ms').at(-1);
  const allocationLatest = ordered(allocation.rows, 'report_date_ms').at(-1) ?? null;
  if (allocation.rows.length && !allocationLatest) mark(allocation.receipt, 'partial', '响应缺少报告日期，无法确认最新一期。');
  combineCodeCoverage(indexQuote, [index], mark);
  return {
    selection: { fund, index, base: number(params.base) ?? 1000, frequency: params.frequency ?? 'monthly', day: number(params.day) ?? 10 },
    signal: {
      drawdown: peak === null ? null : +((last / peak - 1) * 100).toFixed(2),
      ma20: ma20 === null ? null : +ma20.toFixed(2),
      last, pe_percentile: number(indicator?.track_index_pe_ttm_five_year_percentile),
      valuation_scope: { fund, source: 'fund.indicators-history', as_of: timestamp(indicator?.date_ms) },
      rsi: number(indicator?.rsi_pct), donchian: number(indicator?.donchian_channel),
    },
    profile: profile.rows[0] ?? {}, returns: returns.rows[0] ?? {}, drawdowns: drawdowns.rows[0] ?? {},
    allocation: allocation.rows, allocation_latest: allocationLatest,
    quotes: { fund: snapshot, index: byCode(indexQuote.rows).get(index) ?? {} },
    series: [series(fund, '#b85c38', fundBars), series(index, '#42645a', indexBars)], bars: indexBars.slice(-120),
  };
}

async function etfCompare({ read, mark }, params, now) {
  const index = params.index?.toUpperCase() ?? indexDefault;
  const funds = selectedCodes(params.funds ?? etfDefaults);
  const [fundData, candles] = await Promise.all([
    Promise.all(funds.map(async (fund) => {
      const [nav, profile] = await Promise.all([
        read('fund.nav', `${fund} 净值`, { thscode: fund, range: 'year', 'nav-type': 'unit,adj' }, { date: rowTime('nav_date') }),
        read('fund.profile', `${fund} 基金资料`, { thscode: fund }),
      ]);
      return { ...fundNav(nav, mark), profile: profile.rows[0] ?? {} };
    })),
    read('index.history', '指数日线', { thscode: index, ...historyRange(now, 380) }, historyTime),
  ]);
  const indexBars = historyBars(candles, mark);
  return {
    selection: { index, funds },
    rows: fundData.map(({ snapshot, history, profile }, i) => ({
      code: funds[i], last: snapshot.last_price, change: snapshot.price_change_ratio_pct,
      deviation: pairedDeviation(history, indexBars), name: profile.fund_name || funds[i],
      scale: number(profile.fund_scale), rate_info: profile.rate_info ?? [], management_fee_pct: managementFee(profile.rate_info),
      manager: profile.mgmt_name ?? null,
    })),
    series: [...fundData.map(({ history }, i) => series(funds[i], seriesColors[i], history)),
      { ...series(index, '#172033', indexBars), role: 'index' }],
    web_profiles: {},
  };
}

async function auctionRadar({ read, mark }, params) {
  const stocks = selectedCodes(params.stocks ?? auctionDefaults);
  const stage = params.stage ?? 'live';
  const [snapshot, benchmark] = await Promise.all([
    read('market.auction-snapshot', '自选股竞价快照', { thscodes: stocks.join(','), stage }),
    read('market.auction-benchmark', '短线竞价基准', {}, { date: (data) => data.date_ms }),
  ]);
  combineCodeCoverage(snapshot, stocks, mark);
  const status = snapshot.data?.data_status ?? 'unknown';
  if (status === 'not_ready') mark(snapshot.receipt, 'empty', '当前竞价数据尚未就绪。');
  return {
    selection: { stocks, stage }, phase: snapshot.data?.auction_phase ?? 'unknown',
    data_status: status, rows: snapshot.rows, benchmark: benchmark.rows, context: { items: [], sources: [] },
  };
}

async function limitBreak({ read, mark }, params) {
  const date = params.date;
  const pool = { size: 200, ...(date ? { 'date-ms': midnight(date) } : {}) };
  const [up, down, broken, ladder] = await Promise.all([
    read('special.limit-up-pool', '涨停池', { ...pool, 'sort-field': 'limit_up_time', 'sort-dir': 'asc' }, quoteTime),
    read('special.limit-down-pool', '跌停池', pool, quoteTime),
    read('special.limit-break-pool', '炸板池', { ...pool, 'sort-field': 'open_times', 'sort-dir': 'desc' }, quoteTime),
    read('special.limit-up-ladder', '连板梯队'),
  ]);
  const ladderRows = ladder.rows.filter((row) => Number.isFinite(midnight(row.date)) && isRecord(row.boards))
    .sort((a, b) => b.date.localeCompare(a.date));
  const selected = date ? ladderRows.find((row) => row.date === date) : ladderRows[0];
  ladder.receipt.updated_at = timestamp(midnight(selected?.date));
  if (!selected && ladder.data) mark(ladder.receipt, 'empty', '所选日期暂无连板梯队。');
  const upCount = poolCount(up);
  const downCount = poolCount(down);
  const brokenCount = poolCount(broken);
  const truncatedPools = [up, down, broken].filter((result) => poolCount(result) > result.rows.length);
  for (const result of truncatedPools) {
    mark(result.receipt, 'partial', '总数来自分页回执，明细和题材统计限于本次取样。');
  }
  const reasonMap = new Map();
  for (const row of up.rows) {
    const reason = row.limit_up_reason || '未分类';
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
  }
  const breakRate = upCount !== null && brokenCount !== null && upCount + brokenCount > 0
    ? +(brokenCount / (upCount + brokenCount) * 100).toFixed(1) : null;
  return {
    selection: { date: date ?? null },
    stats: { up: upCount, down: downCount, break: brokenCount, truncated: truncatedPools.length > 0, break_rate: breakRate },
    reasons: [...reasonMap].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    up: up.rows.slice(0, 30), down: down.rows.slice(0, 20), breaks: broken.rows.slice(0, 30), ladder: selected ?? { boards: {} },
  };
}

async function hotRank({ read }, params, now) {
  const date = params.date ?? shanghaiDate(now - day);
  const [hour, dayRank, rise, history] = await Promise.all([
    read('special.hot-stock', '小时热股榜', { period: 'hour', limit: 30 }, quoteTime),
    read('special.hot-stock', '24 小时热股榜', { period: 'day', limit: 30 }, quoteTime),
    read('special.skyrocket', '小时飙升榜', { period: 'hour', limit: 20 }, quoteTime),
    read('special.hot-stock-history', '历史热股榜', { date }, { date: (data) => data.date_ms }),
  ]);
  const coverage = { hour: hour.receipt.status, day: dayRank.receipt.status, rise: rise.receipt.status, history: history.receipt.status };
  const dayRows = byCode(dayRank.rows.slice(0, 30));
  const riseRows = byCode(rise.rows.slice(0, 20));
  const historyRows = byCode(history.rows.slice(0, 30));
  const complete = (result) => ['ok', 'empty'].includes(result.receipt.status) && result.rows.every((row) => code(row.thscode));
  const comparison = (matched, boardComplete, symbol) => matched ? true : boardComplete && symbol ? false : null;
  const dayComplete = complete(dayRank);
  const riseComplete = complete(rise);
  const hourRows = hour.rows.slice(0, 30).map((row) => {
    const symbol = code(row.thscode) ? row.thscode.toUpperCase() : null;
    const dayMatch = dayRows.get(symbol);
    const persist = comparison(dayMatch, dayComplete, symbol);
    const fast = comparison(riseRows.get(symbol), riseComplete, symbol);
    const classification = fast === true ? 'rising' : persist === true ? 'persistent'
      : fast === false && persist === false ? 'hour-only' : null;
    return { ...row, persist, fast, classification, day_rank: number(dayMatch?.rank), history_rank: number(historyRows.get(symbol)?.rank) };
  });
  const comparedCount = (field, boardComplete) => complete(hour) && boardComplete && hourRows.every((row) => row[field] !== null)
    ? requestCodes(hourRows.filter((row) => row[field]), 30).length : null;
  return {
    selection: { date }, hour: hourRows, day: dayRank.rows.slice(0, 30), rise: rise.rows.slice(0, 20),
    history: history.rows.slice(0, 30), history_date: history.data?.date ?? null,
    coverage, comparisons: { persistent_count: comparedCount('persist', dayComplete), fast_count: comparedCount('fast', riseComplete) },
  };
}

function positiveStocks(rows, field) {
  const known = rows.filter((row) => code(row.thscode) && number(row[field]) !== null);
  return known.length ? byCode(known.filter((row) => number(row[field]) > 0)).size : null;
}

async function dragonAnomaly({ read, mark }, params) {
  const board = params.board ?? 'all';
  const [dragon, anomaly] = await Promise.all([
    read('special.dragon-tiger', '龙虎榜', { 'board-type': board, ...(params.date ? { date: params.date } : {}) },
      { fields: ['stock_items', 'hot_money_items'], date: dateTime('trade_date'), max: 4000 }),
    read('special.anomaly-list', '个股异动', {}, { date: snapshotTime, max: 4000 }),
  ]);
  const hotMoney = dragon.data?.hot_money_items ?? [];
  const dragonRows = board === 'hot_money'
    ? hotMoney.flatMap((seat) => Array.isArray(seat.rows) ? seat.rows.filter(isRecord).map((row) => ({
      ...row, seat_name: typeof seat.name === 'string' ? seat.name : null,
      seat_id: typeof seat.id === 'string' || Number.isSafeInteger(seat.id) ? seat.id : null,
    })) : [])
    : dragon.rows;
  const anomalyCodes = byCode(anomaly.rows);
  const dragonCodes = byCode(dragonRows);
  const matchedRows = dragonRows.filter((row) => code(row.thscode) && anomalyCodes.has(row.thscode.toUpperCase()));
  const matchedCodes = byCode(matchedRows);
  const visibleAnomalies = anomaly.rows.slice(0, 100);
  const visibleDragon = dragonRows.slice(0, 150);
  if (visibleAnomalies.length < anomaly.rows.length) mark(anomaly.receipt, 'partial', '异动明细展示前 100 条，股票数按已返回的可识别代码去重。');
  if (visibleDragon.length < dragonRows.length) mark(dragon.receipt, 'partial', '榜单明细展示前 150 条，股票数按已返回的可识别代码去重。');
  const boundedCodes = requestCodes([...visibleAnomalies, ...visibleDragon], 50);
  const quotes = boundedCodes.length
    ? await read('market.snapshot', '关联股票行情', { thscodes: boundedCodes.join(','), limit: boundedCodes.length }, quoteTime) : null;
  if (quotes) combineCodeCoverage(quotes, boundedCodes, mark);
  return {
    selection: { board, date: params.date ?? null }, trade_date: dragon.data?.trade_date ?? null,
    dragon: visibleDragon, hot_money: hotMoney.slice(0, 150), anomaly: visibleAnomalies,
    anomaly_count: anomaly.data ? anomaly.receipt.count : null,
    stock_counts: {
      anomaly: anomaly.data ? anomalyCodes.size : null,
      dragon: dragon.data ? dragonCodes.size : null,
      matched: anomaly.data && dragon.data ? matchedCodes.size : null,
      org_positive: positiveStocks(matchedRows, 'org_net_value'),
      hot_money_positive: positiveStocks(matchedRows, board === 'hot_money' ? 'hot_money_item_net_value' : 'hot_money_net_value'),
    },
    quotes: quotes?.rows ?? [],
  };
}

async function linkage({ read, mark }, params, now) {
  const stock = params.stock?.toUpperCase() ?? '600726.SH';
  const sector = params.sector?.toUpperCase() ?? '881105.TI';
  const index = params.index?.toUpperCase() ?? indexDefault;
  const adjust = params.adjust ?? 'forward';
  const indexCodes = unique([sector, index]);
  const today = midnight(shanghaiDate(now));
  const historyEnd = adjust === 'none' && now < today + 15 * 3_600_000 ? today - 1 : now;
  const range = historyRange(historyEnd, 180);
  const [stockQuote, indexQuotes, stockHistory, sectorHistory, indexHistory, members] = await Promise.all([
    read('market.snapshot', '个股行情快照', { thscodes: stock }, quoteTime),
    read('index.snapshot', '板块与基准快照', { thscodes: indexCodes.join(',') }, quoteTime),
    read('market.history', adjust === 'none' ? '个股未复权日线' : '个股前复权日线',
      { thscode: stock, ...range, adjust }, { ...historyTime, source: 'auto' }),
    read('index.history', '板块日线', { thscode: sector, ...range }, historyTime),
    read('index.history', '基准指数日线', { thscode: index, ...range }, historyTime),
    read('index.constituents', '板块成分股', { thscode: sector }, { max: 4000 }),
  ]);
  combineCodeCoverage(stockQuote, [stock], mark);
  combineCodeCoverage(indexQuotes, indexCodes, mark);
  const memberCodes = requestCodes(members.rows, memberSampleLimit);
  const memberQuotes = memberCodes.length
    ? await read('market.snapshot', '板块成分股行情', { thscodes: memberCodes.join(','), limit: memberCodes.length }, quoteTime) : null;
  if (memberQuotes) combineCodeCoverage(memberQuotes, memberCodes, mark);
  const returnedQuotes = byCode(memberQuotes?.rows ?? []);
  const changes = memberCodes.map((value) => returnedQuotes.get(value)).filter((row) => number(row?.price_change_ratio_pct) !== null);
  const rising = changes.filter((row) => number(row.price_change_ratio_pct) > 0).length;
  const falling = changes.filter((row) => number(row.price_change_ratio_pct) < 0).length;
  if (memberQuotes?.rows.length && changes.length < memberCodes.length) {
    mark(memberQuotes.receipt, 'partial', '部分成分股行情或涨跌幅缺失。');
  }
  const stockBars = historyBars(stockHistory, mark);
  const sectorBars = historyBars(sectorHistory, mark);
  const indexBars = historyBars(indexHistory, mark);
  const indices = byCode(indexQuotes.rows);
  const verified = byCode(members.rows).has(stock) ||
    (members.receipt.status === 'ok' && members.rows.every((row) => code(row.thscode)) ? false : null);
  return {
    selection: { stock, sector, index, adjust },
    membership: { verified, total: members.data ? members.receipt.count : null },
    breadth: {
      sample: changes.length, rising, falling, flat: changes.length - rising - falling,
      missing: memberCodes.length - changes.length, requested: memberCodes.length,
      total: members.data ? members.receipt.count : null, limit: memberSampleLimit, scope: 'first-eligible-constituents',
      ratio: changes.length ? +(rising / changes.length * 100).toFixed(1) : null,
      leaders: changes.sort((a, b) => number(b.price_change_ratio_pct) - number(a.price_change_ratio_pct)).slice(0, 8),
    },
    quotes: { stock: byCode(stockQuote.rows).get(stock) ?? {}, sector: indices.get(sector) ?? {}, index: indices.get(index) ?? {} },
    bars: stockBars.slice(-120), series: [series(stock, '#d9343e', stockBars),
      series(sector, '#5a4bb4', sectorBars), series(index, '#146b92', indexBars)],
  };
}

async function localMarketPanel({ read, mark }, params, now) {
  const stockCodes = selectedCodes(params.stocks ?? '600519.SH,000001.SZ');
  const start = params.start ?? shanghaiDate(now - 6 * day);
  const end = params.end ?? shanghaiDate(now);
  if (start > end || midnight(end) - midnight(start) > 29 * day) {
    throw invalidQuery('请选择顺序正确且最多 30 个自然日的查询区间。');
  }
  // Codes and dates have been checked against fixed formats before composing this query.
  const codes = stockCodes.map((entry) => `'${entry}'`).join(', ');
  const sql = `SELECT thscode, CAST(date AS VARCHAR) AS date, open, high, low, close, volume
    FROM raw_kline_daily WHERE thscode IN (${codes}) AND date BETWEEN DATE '${start}' AND DATE '${end}'
    ORDER BY date DESC, thscode LIMIT 180`;
  const result = await read('db.query', '本地 A 股未复权日线', { sql }, {
    source: 'local', max: 180, date: (_data, rows) => midnight(rows[0]?.date),
  });
  const rows = result.rows;
  const coverage = stockCodes.map((thscode) => {
    const bars = rows.filter((row) => row.thscode === thscode);
    return { thscode, days: bars.length, start: bars.at(-1)?.date ?? null, end: bars[0]?.date ?? null };
  });
  const missing = coverage.filter(({ days }) => !days).map(({ thscode }) => thscode);
  if (rows.length && missing.length) mark(result.receipt, 'partial', `所选区间中 ${missing.join('、')} 没有本地记录。`);
  return { selection: { stocks: stockCodes, start, end }, coverage, rows };
}

const cases = new Map([
  ['fund-dca', ['指数定投监控', fundDca, { fund: code, index: code, base: amount, frequency: choice('monthly', 'weekly'), day: planDay }]],
  ['etf-compare', ['同指数 ETF 对比', etfCompare, { index: code, funds: codeList(6) }]],
  ['auction-radar', ['集合竞价监控', auctionRadar, { stocks: codeList(20), stage: choice('live', 'final') }]],
  ['limit-break', ['涨跌停与炸板', limitBreak, { date }]],
  ['hot-stock-ranking', ['热股榜监控', hotRank, { date }]],
  ['dragon-tiger-anomalies', ['龙虎榜与个股异动', dragonAnomaly, { date, board: choice('all', 'org', 'hot_money') }]],
  ['stock-sector-index', ['个股-板块-指数联动', linkage,
    { stock: code, sector: code, index: code, adjust: choice('forward', 'none') }]],
  ['local-market-panel', ['本地市场数据面板', localMarketPanel, { stocks: panelCodes, start: panelDate, end: panelDate }]],
]);

export function officialCase(input) {
  if (!isRecord(input) || Object.keys(input).some((key) => !['id', 'params'].includes(key))) {
    throw invalidQuery('案例请求应提供案例标识及其查询参数。');
  }
  const id = typeof input.id === 'string' ? input.id.replace(/^template:/, '') : null;
  const entry = cases.get(id);
  if (!entry) throw invalidQuery('此查询仅适用于工作台官方动态案例。');
  const [title, build, fields] = entry;
  const now = Date.now();
  const params = Object.hasOwn(input, 'params') ? input.params : {};
  if (!isRecord(params) || Object.entries(params).some(([key, value]) => !Object.hasOwn(fields, key) || !fields[key](value, now))) {
    throw invalidQuery('案例参数的名称、格式或范围无效。');
  }
  async function run(cli, signal) {
    const read = createOfficialCaseData(cli, signal);
    try {
      return read.finish(id, title, await build(read, params, now));
    } finally {
      await read.settle();
    }
  }
  return { requiresAccount: id !== 'local-market-panel', run };
}
