const rowLimit = 20;
const dateLimit = 160;
const number = (value) => (Number.isFinite(value) ? value : null);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
  ? value
  : null;
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function shanghaiDay(value) {
  return timestamp(value) === null ? null : dayFormat.format(value);
}

export function shanghaiTime(value) {
  return timestamp(value) === null ? null : timeFormat.format(value);
}

export function dateCoordinate(value, format) {
  if (typeof value !== 'string' && !Number.isFinite(value)) return null;
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (/^\d{8}$/.test(text)) value = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  let instant;
  let dateOnly = format === 'date';
  if (Number.isFinite(value) || (typeof value === 'string' && /^-?\d{13}$/.test(text))) {
    instant = timestamp(Number(value));
  } else if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(value.trim());
    if (!match) return null;
    const [, day, clock, zone] = match;
    const midnight = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return null;
    if (clock && Number(clock.slice(0, 2)) > 23) return null;
    dateOnly ||= !clock;
    instant = Date.parse(`${day}T${clock ?? '00:00:00'}${zone ?? '+08:00'}`);
  }
  if (!Number.isFinite(instant)) return null;
  const date = dateOnly ? shanghaiDay(instant) : shanghaiTime(instant);
  if (!date) return null;
  // Daily candles and grouped date axes share the same Shanghai-midnight coordinate.
  const time = (dateOnly ? Date.parse(`${date}T00:00:00+08:00`) : instant) / 1000;
  return Number.isFinite(time) ? { time, date } : null;
}

export const historyMetrics = ['close', 'daily-change', 'cumulative-return'];

function text(value, limit = 160) {
  if (typeof value !== 'string') return null;
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function identity(row) {
  return text(row?.thscode, 32);
}

function requestedButMissing(params, rows) {
  const requested = params?.thscodes ?? params?.thscode;
  if (typeof requested !== 'string') return [];
  const returned = new Set(rows.map(identity));
  const codes = new Set(requested.split(',').map((code) => code.trim().toUpperCase()));
  return [...codes].filter((code) => code && !returned.has(code)).slice(0, 100);
}

function pagination(...sources) {
  const pick = (key) => sources.findLast((source) => source && Object.hasOwn(source, key))?.[key];
  const hasMore = pick('has_more');
  return {
    total: number(pick('total')),
    page: number(pick('page')),
    pageSize: number(pick('page_size')),
    offset: number(pick('offset')),
    limit: number(pick('limit')),
    totalPages: number(pick('total_pages') ?? pick('page_count')),
    hasMore: typeof hasMore === 'boolean' ? hasMore : null,
  };
}

function snapshot(data, params) {
  return {
    kind: 'snapshot',
    currency: 'CNY',
    rows: data.item.slice(0, rowLimit).map((row) => ({
      thscode: identity(row),
      lastPrice: number(row?.last_price),
      changePct: number(row?.price_change_ratio_pct),
    })),
    returned: data.item.length,
    missing: requestedButMissing(params, data.item),
  };
}

function isCalendar(dates, observed) {
  if (!Array.isArray(dates) || !dates.length || dates.length > dateLimit) return false;
  const unique = new Set(dates);
  return dates.every((date, index) => typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) && shanghaiDay(Date.parse(date)) === date &&
    (index === 0 || dates[index - 1] < date)) && observed.every((date) => unique.has(date));
}

function history(data, value) {
  const { params, display, tradingDates } = value;
  const observed = new Set();
  const series = data.item.map((group) => {
    const prices = new Map();
    for (const row of group.item) {
      const date = shanghaiDay(row?.date_ms);
      if (!date) continue;
      observed.add(date);
      prices.set(date, prices.has(date) ? null : number(row.close_price));
    }
    return { group, prices };
  });
  const observedDates = [...observed].sort();
  const calendar = isCalendar(tradingDates, observedDates);
  const dates = calendar ? tradingDates : observedDates.slice(-dateLimit);
  return {
    kind: 'history',
    currency: 'CNY',
    adjust: ['none', 'forward', 'backward'].includes(data.adjust) ? data.adjust : null,
    start: shanghaiDay(params?.startMs ?? params?.['start-ms']),
    end: shanghaiDay(params?.endMs ?? params?.['end-ms']),
    calendar,
    dates,
    displayedMetric: historyMetrics.includes(display) ? display : 'close',
    returnedDates: observedDates.length,
    returned: data.item.reduce((count, group) => count + group.item.length, 0),
    missing: requestedButMissing(params, data.item),
    series: series.map(({ group, prices }) => ({
      thscode: identity(group),
      returned: group.item.length,
      asOf: timestamp(group.timestamp),
      close: dates.map((date) => prices.get(date) ?? null),
    })),
  };
}

export function historyValues(presentation, requestedMetric) {
  const metric = requestedMetric === 'daily-change' && !presentation.calendar
    ? 'close'
    : requestedMetric;
  const daily = metric === 'daily-change';
  const dates = daily ? presentation.dates.slice(1) : presentation.dates;
  const series = presentation.series.map(({ close, ...group }) => {
    if (metric === 'close') return { ...group, values: close };
    const values = close.map((price, index) => {
      const base = daily ? close[index - 1] : close[0];
      if (!Number.isFinite(base) || base === 0 || price === null) return null;
      return number((price / base - 1) * 100);
    });
    return { ...group, values: daily ? values.slice(1) : values };
  });
  return { metric, dates, series };
}

function tableCell(value) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  return text(typeof value === 'string' ? value : JSON.stringify(value), 120);
}

function table(data, fallbackCount) {
  const list = Array.isArray(data) ? data : [data?.item, data?.items, data?.rows, data?.capabilities]
    .find(Array.isArray);
  const raw = list ?? (data == null ? [] : [data]);
  const preview = raw.slice(0, rowLimit).map((row) => object(row) ? row : { value: row });
  const fields = [...new Set(preview.flatMap(Object.keys))];
  const visibleFields = fields.slice(0, 8);
  return {
    kind: 'table',
    columns: visibleFields.map((key) => text(key, 80)),
    rows: preview.map((row) => visibleFields.map((key) =>
      tableCell(Object.hasOwn(row, key) ? row[key] : null))),
    rowUnit: raw.length && raw.every((row) => Array.isArray(row?.item)) ? '组' : '条',
    returned: data == null ? number(fallbackCount) : raw.length,
    moreFields: fields.length > visibleFields.length,
  };
}

/** Project the successful CLI-backed tool result into a bounded, replayable view. */
export function buildPresentation(value) {
  if (value?.ok !== true || value.op !== 'run' || typeof value.capability !== 'string') return null;
  const { data, capability, params, resultRef, meta, summary } = value;
  let view;
  if (capability === 'market.snapshot' && Array.isArray(data?.item)) {
    view = snapshot(data, params);
  } else if (capability === 'market.history-batch' && data?.interval === '1d' &&
    Array.isArray(data.item) && data.item.length <= 10 && data.item.every((group) => Array.isArray(group?.item))) {
    view = history(data, value);
  } else {
    view = table(data, resultRef?.rows ?? summary?.rows ?? meta?.count);
  }
  return {
    v: 1,
    capability,
    asOf: timestamp(data?.timestamp ?? summary?.timestamp),
    pagination: pagination(meta, summary, view.kind === 'history' ? null : data),
    truncated: meta?.truncated === true,
    resultPath: typeof resultRef?.path === 'string' && resultRef.path.length <= 4096 ? resultRef.path : null,
    ...view,
  };
}
