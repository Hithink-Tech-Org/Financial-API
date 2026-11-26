import { createElement as h, useId, useState } from 'react';
import { historyValues, shanghaiTime } from '../presentation/index.js';
import { renderToolName } from './turn-tail.js';
import { RenderCard } from './render-card.js';
import { recordedResult, seriesSegments } from './view-state.js';

const empty = '—';
const labels = {
  'market.snapshot': 'A 股行情快照', 'market.history-batch': 'A 股历史行情',
  'market.calendar': '交易日历', 'symbol.search': '标的检索',
};
const metricLabels = { close: '收盘价', 'daily-change': '逐日涨跌幅', 'cumulative-return': '区间累计收益' };
const adjustLabels = { none: '不复权', forward: '前复权', backward: '后复权' };
const fieldLabels = {
  thscode: '代码', name: '名称', asset_type: '类型', exchange: '交易所', currency: '币种',
  date: '日期', date_ms: '日期时间戳（毫秒）',
};
const priceFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const percentFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero',
});
const formatPrice = (value) => Number.isFinite(value) ? priceFormat.format(value) : empty;
const formatPercent = (value) => Number.isFinite(value) ? `${percentFormat.format(value)}%` : empty;

function DataTable({ headers, rows, caption }) {
  if (!rows.length) return null;
  return h('div', { className: 'hf-table-scroll', tabIndex: 0, 'aria-label': caption, role: 'region' },
    h('table', { className: 'hf-table' },
      h('caption', { className: 'hf-sr-only' }, caption),
      h('thead', null, h('tr', null, headers.map((label, index) => h('th', { key: index, scope: 'col' }, label)))),
      h('tbody', null, rows.map((row, index) => h('tr', { key: index },
        row.map((value, column) => h('td', { key: column }, value == null ? empty : String(value))),
      ))),
    ),
  );
}

function Coverage({ view, count }) {
  const { returned, truncated, missing, pagination, rowUnit = '条' } = view;
  const status = [];
  if (count != null && returned != null) status.push(`显示 ${count} ${rowUnit} · 本次返回 ${returned} ${rowUnit}`);
  if (pagination?.page != null) status.push(`第 ${pagination.page} 页${pagination.totalPages == null ? '' : `，共 ${pagination.totalPages} 页`}`);
  if (pagination?.pageSize != null) status.push(`每页 ${pagination.pageSize} 条`);
  if (pagination?.offset != null) status.push(`偏移 ${pagination.offset}`);
  if (pagination?.limit != null) status.push(`查询上限 ${pagination.limit}`);
  if (pagination?.total != null) status.push(`接口总数 ${pagination.total}`);
  else if (pagination?.page != null || pagination?.offset != null || pagination?.hasMore != null) status.push('接口总数未提供');
  if (pagination?.hasMore != null) status.push(pagination.hasMore ? '还有下一页' : '已到最后一页');
  if (truncated) status.push('服务结果已截断');
  return h('div', { className: 'hf-coverage' },
    status.length > 0 && h('p', { className: 'hf-note' }, status.join(' · ')),
    missing?.length > 0 && h('p', { className: 'hf-note' }, `未返回的请求代码 ${missing.join('、')}`),
  );
}

function Snapshot({ view }) {
  const time = shanghaiTime(view.asOf);
  return h('div', { className: 'hf-result-body' },
    h('p', { className: 'hf-note' }, time ? `整批数据最新时点 ${time}（上海时间）` : '数据时点未提供'),
    view.rows.length ? h('ul', { className: 'hf-snapshots' }, view.rows.map((row, index) => {
      const change = row.changePct;
      return h('li', { key: index, className: 'hf-quote' },
        h('strong', { className: 'hf-code' }, row.thscode ?? '标的代码缺失'),
        h('span', { className: `hf-change ${change > 0 ? 'hf-rise' : change < 0 ? 'hf-fall' : ''}`, 'aria-label': `涨跌幅 ${formatPercent(change)}` }, formatPercent(change)),
        h('span', { className: 'hf-note' }, `最新价 ${formatPrice(row.lastPrice)} ${view.currency}`),
      );
    })) : h('p', null, '本次查询没有返回快照。'),
    h(Coverage, { view, count: view.rows.length }),
  );
}

const seriesClass = (index) => `hf-series-${index % 10}`;

function Chart({ data }) {
  const { dates, series, calendar, metric } = data;
  const values = series.flatMap((group) => group.values.filter(Number.isFinite));
  if (!values.length) return h('p', null, '当前时间区间没有可绘制的数据。');

  const left = 86;
  const right = 610;
  const top = 16;
  const bottom = 188;
  const low = Math.min(...values, ...(metric === 'close' ? [] : [0]));
  const high = Math.max(...values, ...(metric === 'close' ? [] : [0]));
  const padding = (high - low) * 0.06 || Math.max(Math.abs(high) * 0.01, 0.01);
  const min = low - padding;
  const max = high + padding;
  const x = (index) => left + (right - left) * (dates.length === 1 ? 0.5 : index / (dates.length - 1));
  const y = (value) => bottom - (bottom - top) * (value - min) / (max - min);
  const format = metric === 'close' ? formatPrice : formatPercent;
  const tickCount = Math.min(5, dates.length);
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    tickCount === 1 ? 0 : Math.round(index * (dates.length - 1) / (tickCount - 1)));

  return h('div', { className: 'hf-chart-scroll', role: 'region', 'aria-label': '历史走势图', tabIndex: 0 },
    h('svg', { className: 'hf-chart', viewBox: '0 0 640 222', role: 'img', 'aria-label': `${metricLabels[metric]}走势，按上海交易日对齐` },
      [0, 1, 2, 3, 4].map((index) => {
        const value = min + (max - min) * index / 4;
        return h('g', { key: index, className: 'hf-chart-axis' },
          h('line', { x1: left, x2: right, y1: y(value), y2: y(value) }),
          h('text', { x: left - 9, y: y(value) + 4, textAnchor: 'end' }, format(value)),
        );
      }),
      metric !== 'close' && h('line', { className: 'hf-chart-zero', x1: left, x2: right, y1: y(0), y2: y(0) }),
      ticks.map((index) => h('text', { key: index, className: 'hf-chart-axis',
        x: x(index), y: bottom + 22, textAnchor: 'middle' }, dates[index].slice(5))),
      series.map((group, seriesIndex) => h('g', { className: seriesClass(seriesIndex), key: seriesIndex },
        seriesSegments(dates, group.values, calendar).map((segment, segmentIndex) => h('g', { key: segmentIndex },
          segment.length > 1 && h('polyline', {
            className: 'hf-chart-line', points: segment.map((point) => `${x(point.index)},${y(point.value)}`).join(' '),
          }),
          (dates.length <= 36 || segment.length === 1) && segment.map((point) => h('circle', {
            key: point.index, cx: x(point.index), cy: y(point.value), r: 3.3, className: 'hf-chart-point',
          }, h('title', null, `${group.thscode ?? '代码缺失'} · ${dates[point.index]} · ${format(point.value)}`))),
        )),
      )),
    ),
  );
}

function History({ view }) {
  const [requested, setRequested] = useState(view.displayedMetric);
  const chart = { ...historyValues(view, requested), calendar: view.calendar };
  const { series, dates, metric } = chart;
  const actualRows = series.reduce((sum, group) => sum + group.values.filter(Number.isFinite).length, 0);
  const format = metric === 'close' ? formatPrice : formatPercent;
  const adjustment = Object.hasOwn(adjustLabels, view.adjust) ? adjustLabels[view.adjust] : '复权方式未提供';
  const interval = dates.length ? `${dates[0]} 至 ${dates.at(-1)}` : '区间无行情日期';
  const requestInterval = view.start && view.end && (dates[0] !== view.start || dates.at(-1) !== view.end)
    ? `查询区间 ${view.start} 至 ${view.end}` : null;
  const unit = metric === 'close' ? view.currency : '%';
  const basis = metric === 'daily-change' ? '按所选复权收盘价与前一交易日收盘价计算。'
    : metric === 'cumulative-return' ? '按所选复权收盘价与图中首日收盘价计算。' : null;
  const hasUnshownDates = !view.calendar && view.returnedDates > dates.length;
  return h('div', { className: 'hf-result-body hf-history' },
    h('div', { className: 'hf-chart-head' },
      h('div', null,
        h('strong', null, `${metricLabels[metric]}（${unit}）`),
        h('p', { className: 'hf-note' }, `${interval} · ${adjustment} · 上海时间`),
      ),
      h('label', { className: 'hf-metric' },
        h('span', { className: 'hf-sr-only' }, '选择历史行情指标'),
        h('select', { value: metric, onChange: (event) => setRequested(event.target.value) },
          Object.entries(metricLabels).map(([value, label]) => h('option', {
            key: value, value, disabled: value === 'daily-change' && !view.calendar,
          }, label)),
        ),
      ),
    ),
    h('ul', { className: 'hf-legend', 'aria-label': '标的与数据时点' }, series.map((group, index) =>
      h('li', { key: index },
        h('span', { className: `hf-legend-key ${seriesClass(index)}` }),
        h('span', { className: 'hf-code' }, group.thscode ?? '代码缺失'),
        h('span', { className: 'hf-note' }, group.returned ? shanghaiTime(group.asOf) ?? '时点未提供' : '无行情记录'),
      ),
    )),
    h(Chart, { data: chart }),
    requestInterval && h('p', { className: 'hf-note' }, requestInterval),
    h('p', { className: 'hf-note' }, `本次返回 ${view.returned} 条行情 · 图中 ${actualRows} 个有效值`),
    basis && h('p', { className: 'hf-note' }, basis),
    !view.calendar && h('p', { className: 'hf-note' }, '交易日历未对齐，逐日涨跌幅不可用。未确认相邻的日期以缺口显示。'),
    hasUnshownDates && h('p', { className: 'hf-note' }, `预览最近 ${dates.length} 个日期，本次共返回 ${view.returnedDates} 个日期。`),
    series.length > 0 && dates.length > 0 && h('details', { className: 'hf-details' },
      h('summary', null, '查看数据表'),
      h(DataTable, { caption: `${metricLabels[metric]}数据表`,
        headers: ['交易日', ...series.map((group) => group.thscode ?? '代码缺失')],
        rows: dates.map((date, index) => [date, ...series.map((group) => format(group.values[index]))]),
      }),
    ),
    h(Coverage, { view }),
  );
}

function GenericTable({ view }) {
  const time = shanghaiTime(view.asOf);
  return h('div', { className: 'hf-result-body' },
    time && h('p', { className: 'hf-note' }, `数据时点 ${time}（上海时间）`),
    view.rows.length ? h(DataTable, {
      headers: view.columns.map((column) => Object.hasOwn(fieldLabels, column) ? fieldLabels[column] : column),
      rows: view.rows, caption: '查询结果预览',
    }) : h('p', null, view.resultPath ? '完整查询结果已保存。' : '本次查询没有返回记录。'),
    view.moreFields && h('p', { className: 'hf-note' }, '表格展示部分字段。'),
    h(Coverage, { view, count: view.rows.length }),
  );
}

export function FinanceToolView({ phase, block, openFile, inspect }) {
  const id = useId();
  const rendering = block?.call?.name === renderToolName;
  if (phase !== 'result') return h('div', { className: 'hf-widget hf-tool-status', role: 'status' },
    rendering ? '正在生成金融数据卡片…' : '正在读取金融数据记录…');
  const { view, error, summary } = recordedResult(block);
  if (view?.version === 1) return h(RenderCard, { view });
  const capability = view?.capability;
  const title = Object.hasOwn(labels, capability) ? labels[capability] : capability ?? (rendering ? '金融数据卡片' : '金融数据查询');
  return h('section', { className: 'hf-widget hf-result', 'aria-labelledby': id },
    h('header', { className: 'hf-result-head' }, h('h3', { id }, title)),
    error ? h('div', { className: 'hf-result-body' },
      h('p', { className: 'hf-error', role: 'alert' }, error.message ?? error.reason ?? '结果暂时无法显示。'),
      error.requestId && h('p', { className: 'hf-note' }, `请求标识 ${error.requestId}`),
    ) : view?.kind === 'snapshot' ? h(Snapshot, { view })
      : view?.kind === 'history' ? h(History, { view })
        : view?.kind === 'table' ? h(GenericTable, { view })
          : h('div', { className: 'hf-result-body' }, summary ? h('details', { className: 'hf-details' },
            h('summary', null, '查看查询回执'), h('pre', { className: 'hf-raw' }, summary),
          ) : h('p', null, '当前记录没有可展示的回执。')),
    (view?.resultPath || (!view && inspect)) && h('footer', { className: 'hf-result-footer' },
      view?.resultPath && openFile && h('button', { type: 'button', className: 'hf-button', onClick: () => openFile(view.resultPath) }, '打开完整结果'),
      !view && inspect && h('button', { type: 'button', className: 'hf-button', onClick: inspect }, '查看调用详情'),
    ),
    view?.resultPath && openFile && h('p', { className: 'hf-note hf-file-note' }, '完整文件由当前工作区保存。'),
  );
}
