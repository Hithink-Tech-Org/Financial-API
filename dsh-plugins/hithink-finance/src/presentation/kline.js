// Lightweight Charts requires one strictly increasing Unix-second key per record.
export { dateCoordinate as klineTime } from './index.js';

export function validCandle({ values: [open, close, low, high] }) {
  return [open, close, low, high].every(Number.isFinite)
    && low <= Math.min(open, close) && high >= Math.max(open, close);
}

export function pricePrecision(bars) {
  const precision = (value) => value.toFixed(12).replace(/0+$/, '').split('.')[1]?.length ?? 0;
  return Math.max(2, ...bars.flatMap(({ values }) => values.filter(Number.isFinite).map(precision)));
}

export function recentKlineRange(count, points) {
  const latest = count - 1;
  const first = Math.max(0, count - points);
  return { from: first - 0.5, to: latest + 0.5 };
}
