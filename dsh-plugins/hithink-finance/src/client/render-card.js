import { createElement as h, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { cardContext, chartData, defaultTitles, displayField, formatValue, numberValue } from '../presentation/render.js';
import { FinancialChart } from './charts.js';
import { KlineChart } from './kline.js';
import { customDocument } from './custom-view.js';

const snapshotTitle = ['name', 'stock_name', 'fund_name', 'thscode', 'symbol'];
const priceKeys = ['last_price', 'price', 'close_price', 'close'];
const changeKeys = ['price_change_ratio_pct', 'change_pct', 'change_percent'];
const own = (row, key) => Object.hasOwn(row, key) ? row[key] : undefined;
const numberFormats = ['number', 'integer', 'currency', 'percent', 'ratio'];

function RecordTable({ view, title }) {
  const fields = view.fields.map(({ key }) => displayField(key, view));
  return h('div', { className: 'hf-table-scroll hf-records', tabIndex: 0, role: 'region', 'aria-label': title },
    h('table', { className: 'hf-table' },
      h('caption', { className: 'hf-sr-only' }, title),
      h('thead', null, h('tr', null, fields.map(({ key, label, format }) =>
        h('th', { key, scope: 'col', className: numberFormats.includes(format) ? 'hf-number' : undefined }, label)))),
      h('tbody', null, view.rows.map((row, index) => h('tr', { key: index },
        fields.map((field) => {
          const { key, format } = field;
          const value = own(row, key);
          return h('td', { key, className: numberFormats.includes(format) ? 'hf-number' : undefined },
            formatValue(value, format === 'currency' && !field.unit ? { ...field, unit: row.currency } : field));
        }))))));
}

function SnapshotCards({ view }) {
  const shown = view.rows.slice(0, 12);
  const knownFields = ['open_price', 'high_price', 'low_price', 'prev_price', 'volume', 'turnover', 'timestamp'];
  return h('ul', { className: 'hf-snapshots hf-market-snapshots' }, shown.map((row, index) => {
    const nameKey = snapshotTitle.find((key) => own(row, key));
    const priceKey = priceKeys.find((key) => Object.hasOwn(row, key));
    const changeKey = changeKeys.find((key) => Object.hasOwn(row, key));
    const price = priceKey && displayField(priceKey, view);
    const code = nameKey !== 'thscode' && row.thscode;
    const currency = row.currency;
    const change = numberValue(row[changeKey]);
    return h('li', { key: index, className: 'hf-quote' },
      h('div', { className: 'hf-quote-title' },
        h('strong', { className: 'hf-code' }, row[nameKey] ?? '代码缺失'),
        code && h('span', { className: 'hf-note' }, code)),
      h('div', { className: 'hf-quote-primary' },
        price && h('div', null, h('span', { className: 'hf-note' }, price.label),
          h('div', { className: 'hf-price' }, formatValue(row[priceKey], { ...price, unit: price.unit ?? currency }))),
        changeKey && h('div', null, h('span', { className: 'hf-note' }, displayField(changeKey, view).label),
          h('div', { className: `hf-quote-change ${change > 0 ? 'hf-rise' : change < 0 ? 'hf-fall' : ''}` },
            change > 0 && '+', formatValue(row[changeKey], displayField(changeKey, view))))),
      h('dl', { className: 'hf-quote-facts' }, knownFields.filter((key) => Object.hasOwn(row, key)).map((key) => {
        const field = displayField(key, view);
        return h('div', { key }, h('dt', null, field.label), h('dd', null, formatValue(row[key], field)));
      })));
  }));
}

function CustomCard({ view, title }) {
  const frame = useRef(null);
  const handshake = useMemo(() => {
    const token = [...crypto.getRandomValues(new Uint32Array(4))].join('-');
    return { token, srcDoc: customDocument(token) };
  }, [view]);
  useLayoutEffect(() => {
    // A transferred port stays with the srcdoc document across iframe navigations.
    function ready(event) {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null'
        || event.data?.type !== 'hithink-finance:ready' || event.data?.token !== handshake.token || !event.ports[0]) return;
      window.removeEventListener('message', ready);
      event.ports[0].postMessage({ rows: view.rows, source: view.custom.source });
      event.ports[0].close();
    }
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [handshake, view.rows, view.custom.source]);
  const height = Math.max(160, Math.min(640, Number(view.custom.height) || 360));
  return h('iframe', {
    ref: frame, srcDoc: handshake.srcDoc, sandbox: 'allow-scripts', title, height, className: 'hf-custom-frame',
    referrerPolicy: 'no-referrer', allow: "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-write 'none'",
  });
}

export function RenderCard({ view }) {
  const id = useId();
  const title = view.title ?? defaultTitles[view.template];
  const context = cardContext(view);
  const isChart = ['kline', 'line', 'ranking', 'financial'].includes(view.template);
  const chartModel = useMemo(() => isChart ? chartData(view) : null, [isChart, view]);
  const chart = chartModel?.reason ? null : chartModel;
  const hasSnapshot = view.template === 'snapshot' && view.rows.some((row) => [...priceKeys, ...changeKeys].some((key) => Object.hasOwn(row, key)));
  const hasTable = view.rows.length > 0 && view.fields.length > 0;
  const deferTable = Boolean(chart || hasSnapshot || view.template === 'custom');
  const rowCount = view.rowCount ?? view.rows.length;
  return h('section', { className: 'hf-widget hf-result hf-render-card', 'aria-labelledby': id },
    h('header', { className: 'hf-result-head' },
      h('div', { className: 'hf-card-heading' }, h('h3', { id }, title), context && h('p', { className: 'hf-note' }, context)),
      h('span', { className: 'hf-note' }, view.truncated ? `展示 ${view.rows.length} / ${rowCount} 条` : `${rowCount} 条记录`)),
    h('div', { className: 'hf-result-body' },
      view.rows.length === 0 && view.template !== 'custom' && h('p', { className: 'hf-note' }, '这里还没有可展示的记录。'),
      view.template === 'custom' && h(CustomCard, { view, title }),
      hasSnapshot && h(SnapshotCards, { view }),
      hasSnapshot && view.rows.length > 12 && h('p', { className: 'hf-note' }, '快照显示前 12 条，其余记录见下方数据表。'),
      chart && (view.template === 'kline' ? h(KlineChart, { data: chart, title })
        : h(FinancialChart, { data: chart, template: view.template, title })),
      isChart && view.rows.length > 0 && !chart && h('p', { className: 'hf-note' },
        chartModel?.reason ?? '这些记录可在下方数据表查看。绘图需要有效的坐标和可比较的数值。'),
      hasTable && (deferTable ? h('details', { className: 'hf-details hf-card-details' },
        h('summary', null, '查看数据表'), h(RecordTable, { view, title })) : h(RecordTable, { view, title })),
    ));
}
