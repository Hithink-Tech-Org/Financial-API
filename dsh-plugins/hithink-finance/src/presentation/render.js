import { dateCoordinate } from './index.js';
import { klineTime, validCandle } from './kline.js';

export const renderTemplates = ['snapshot', 'kline', 'line', 'ranking', 'financial', 'table', 'custom'];
export const defaultTitles = {
  snapshot: '行情快照', kline: 'K 线与成交量', line: '数据走势', ranking: '排名对比',
  financial: '财务对比', table: '数据表', custom: '自定义金融组件',
};

const fieldDefaults = {
  thscode: ['代码'], name: ['名称'], stock_name: ['证券名称'], fund_name: ['基金名称'],
  date: ['交易日', 'date'], date_ms: ['交易日', 'date'], trade_date: ['交易日', 'date'], trading_date: ['交易日', 'date'],
  timestamp: ['数据时点', 'datetime'], datetime: ['时间', 'datetime'], time: ['时间', 'datetime'],
  period_end: ['报告期', 'date'], period_end_ms: ['报告期', 'date'], report_date_ms: ['披露日期', 'date'],
  last_price: ['最新价', 'number'], price_change: ['涨跌额', 'number'],
  price_change_ratio_pct: ['涨跌幅', 'percent'], change_pct: ['涨跌幅', 'percent'],
  prev_price: ['昨收', 'number'], open_price: ['开盘', 'number'], close_price: ['收盘', 'number'],
  high_price: ['最高', 'number'], low_price: ['最低', 'number'],
  open: ['开盘', 'number'], close: ['收盘', 'number'], high: ['最高', 'number'], low: ['最低', 'number'],
  volume: ['成交量', 'number'], turnover: ['成交额', 'number'], currency: ['币种'],
  rank: ['排名', 'integer'], hot_rank: ['热度排名', 'integer'], investment_rank: ['持仓排名', 'integer'],
  hot_value: ['热度', 'number'], hold_ratio: ['持仓占比', 'percent'],
  security_market_value_rate_pct: ['证券市值占比', 'percent'],
  operating_income: ['营业收入', 'currency'], operating_costs: ['营业成本', 'currency'],
  operating_profit: ['营业利润', 'currency'], net_profit: ['净利润', 'currency'],
  total_assets: ['资产合计', 'currency'], total_liabilities: ['负债合计', 'currency'],
  net_cash_flows_oper_act: ['经营活动现金流量净额', 'currency'],
  parent_holder_net_profit: ['归母净利润', 'currency'], basic_eps: ['基本每股收益', 'number'],
};

const numeric = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 });
const adjustments = { none: '不复权', forward: '前复权', backward: '后复权' };
const intervals = { '1d': '日线', '1w': '周线', '1mo': '月线' };
const dates = ['date_ms', 'date', 'trade_date', 'trading_date', 'timestamp', 'datetime', 'time'];
const periods = ['period_end_ms', 'period_end', 'report_date_ms', 'report_date', 'period', ...dates];
const category = ['stock_name', 'name', 'fund_name', 'category', 'thscode', 'symbol'];
const financial = ['operating_income', 'operating_profit', 'net_profit', 'parent_holder_net_profit', 'total_assets',
  'total_liabilities', 'net_cash_flows_oper_act'];
const ranks = ['investment_rank', 'rank', 'hot_rank'];
const scores = ['hot_value', 'hold_ratio', 'security_market_value_rate_pct', 'weight', 'price_change_ratio_pct', ...ranks];
const ambiguous = {
  identity: '部分记录缺少分组标识，完整记录见下方数据表。',
  date: '部分记录缺少有效坐标，完整记录见下方数据表。',
  duplicate: '同一分组存在重复坐标，完整记录见下方数据表。',
};
const groupName = (value) => (typeof value === 'string' && value.trim()) || Number.isFinite(value) ? String(value) : null;

export function numberValue(value) {
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    value = Number(value);
  }
  return Number.isFinite(value) ? value : null;
}

export function displayField(field, view) {
  const supplied = view.fields.find(({ key }) => key === field);
  const [label, defaultFormat] = Object.hasOwn(fieldDefaults, field) ? fieldDefaults[field] : [];
  let unit = supplied?.unit;
  const format = supplied?.format && supplied.format !== 'auto' ? supplied.format : defaultFormat
    ?? (field.endsWith('_pct') ? 'percent' : field.endsWith('_time_ms') ? 'datetime' : field.endsWith('_date_ms') ? 'date' : 'auto');
  if (!unit && format === 'currency') {
    const currencies = new Set(view.rows.map((row) => row.currency).filter((value) => typeof value === 'string' && value));
    if (currencies.size === 1 && view.rows.every((row) => row.currency)) [unit] = currencies;
  }
  return { key: field, label: supplied?.label ?? label ?? field, format, unit };
}

export function formatValue(value, field = {}, abbreviated = false) {
  if (value == null || value === '') return '—';
  if (field.format === 'date' || field.format === 'datetime') {
    const point = dateCoordinate(value, field.format);
    return point?.date ?? (field.format === 'datetime' && typeof value === 'string' && value.trim() ? value : '—');
  }
  if (field.format === 'text') return String(value);
  const amount = numberValue(value);
  if (amount == null || (field.format === 'auto' && typeof value === 'string')) return String(value);
  if (field.format === 'percent' || field.format === 'ratio') {
    return `${percent.format(field.format === 'ratio' ? amount * 100 : amount)}%`;
  }
  const formatter = abbreviated ? compact : field.format === 'integer' ? integer : numeric;
  return `${formatter.format(amount)}${field.unit ? ` ${field.unit}` : ''}`;
}

export function cardContext(view) {
  const { asOf, adjust, interval, subtitle } = view;
  const time = asOf == null ? null : formatValue(asOf, { format: 'datetime' });
  const formattedTime = time && time !== '—' && time !== asOf ? `${time}（上海时间）` : time;
  return [
    formattedTime && formattedTime !== '—' && `数据时点 ${formattedTime}`,
    typeof interval === 'string' && (Object.hasOwn(intervals, interval) ? intervals[interval] : `周期 ${interval}`),
    typeof adjust === 'string' && (Object.hasOwn(adjustments, adjust) ? adjustments[adjust] : `复权 ${adjust}`),
    typeof subtitle === 'string' && subtitle,
  ].filter(Boolean).join(' · ');
}

export function validRenderView(view) {
  return view?.version === 1 && renderTemplates.includes(view.template)
    && Array.isArray(view.rows) && view.rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))
    && Array.isArray(view.fields) && view.fields.every((field) => typeof field?.key === 'string')
    && (view.series === undefined || (Array.isArray(view.series) && view.series.every((entry) => typeof entry?.key === 'string')))
    && (view.template !== 'custom' || typeof view.custom?.source === 'string');
}

export function chartData(view) {
  const has = (key) => view.rows.some((row) => Object.hasOwn(row, key));
  const first = (keys) => keys.find(has);
  const x = view.x ?? first(view.template === 'ranking' ? category : view.template === 'financial' ? periods : dates)
    ?? (view.template === 'financial' ? first(category) : undefined);
  if (!x) return null;
  const xField = displayField(x, view);
  if (view.template === 'kline') {
    const keys = ['open', 'close', 'low', 'high'].map((key) => first([`${key}_price`, key]));
    if (keys.some((key) => !key)) return null;
    const groupBy = view.series?.[0]?.groupBy ?? first(['thscode', 'symbol']);
    const volumeKey = first(['volume', 'trade_volume']);
    const groups = new Map();
    for (const row of view.rows) {
      const point = klineTime(row[x], xField.format);
      if (!point) return { reason: ambiguous.date };
      const group = groupBy ? groupName(row[groupBy]) : '';
      if (group === null) return { reason: ambiguous.identity };
      if (!groups.has(group)) groups.set(group, new Map());
      const bars = groups.get(group);
      if (bars.has(point.time)) return { reason: ambiguous.duplicate };
      const volume = numberValue(row[volumeKey]);
      const values = keys.map((key) => numberValue(row[key]));
      bars.set(point.time, { ...point, values, volume });
    }
    const sorted = new Map([...groups].map(([group, bars]) => {
      const points = [...bars.values()];
      points.sort((left, right) => left.time - right.time);
      return [group, points];
    }));
    if (![...sorted.values()].some((bars) => bars.some(validCandle))) return null;
    return { groups: sorted, fields: keys.map((key) => displayField(key, view)), volume: volumeKey && displayField(volumeKey, view) };
  }
  const fallback = view.template === 'ranking' ? [first(scores)] : view.template === 'financial'
    ? financial.filter(has).slice(0, 3) : [first(['close_price', 'close', 'last_price', 'net_value', 'nav', 'price', 'value'])];
  const defaultGroup = view.template === 'line' ? first(['thscode', 'symbol']) : undefined;
  const series = (view.series?.length ? view.series : fallback.filter(Boolean).map((key) => ({ key })))
    .map((entry) => ({ ...entry, groupBy: entry.groupBy ?? defaultGroup }));
  if (!series.length) return null;
  const currencies = new Set(view.rows.map((row) => row.currency).filter(Boolean));
  if (view.template === 'financial' && currencies.size > 1 && series.some(({ key }) => {
    const field = displayField(key, view);
    return field.format === 'currency' && !field.unit;
  })) return null;
  const dateAxis = ['date', 'datetime'].includes(xField.format);
  const rows = view.rows.filter((row) => row[x] != null && row[x] !== '').map((row) => {
    if (!dateAxis) return { row, key: row[x], label: formatValue(row[x], xField) };
    const point = dateCoordinate(row[x], xField.format);
    return { row, key: point?.time, label: point?.date };
  });
  if (dateAxis && rows.some(({ key }) => key === undefined)) return { reason: ambiguous.date };
  if (view.template !== 'ranking') {
    if (dateAxis) rows.sort((left, right) => left.key - right.key);
    else if (periods.includes(x)) rows.sort((left, right) => left.label.localeCompare(right.label, 'en', { numeric: true }));
  }
  // Category charts preserve input rows. Grouped series align by the same date or category.
  const grouped = series.some(({ groupBy }) => groupBy);
  if (grouped && rows.length < view.rows.length) return { reason: ambiguous.date };
  const axis = grouped ? [...new Map(rows.map(({ key, label }) => [key, label]))] : rows.map(({ key, label }) => [key, label]);
  const labels = axis.map(([, label]) => label);
  const plots = [];
  for (const { key, label, groupBy } of series) {
    const field = displayField(key, view);
    const name = label ?? field.label;
    if (!groupBy) {
      if (grouped && axis.length !== rows.length) return { reason: ambiguous.duplicate };
      plots.push({ name, field, values: rows.map(({ row }) => numberValue(row[key])) });
      continue;
    }
    const groups = new Map();
    for (const { row, key: coordinate, label: axisLabel } of rows) {
      const group = groupName(row[groupBy]);
      if (group === null) return { reason: ambiguous.identity };
      if (axisLabel === '—') return { reason: ambiguous.date };
      if (!groups.has(group)) groups.set(group, { labels: new Set(), points: new Map() });
      const assigned = groups.get(group);
      if (assigned.labels.has(axisLabel) || assigned.points.has(coordinate)) return { reason: ambiguous.duplicate };
      assigned.labels.add(axisLabel);
      assigned.points.set(coordinate, row[key]);
    }
    for (const [group, { points }] of groups) {
      plots.push({
        name: series.length === 1 ? group : `${group} · ${name}`,
        field,
        values: axis.map(([coordinate]) => numberValue(points.get(coordinate))),
      });
    }
  }
  return plots.some(({ values }) => values.some((value) => value != null)) ? { labels, plots } : null;
}
