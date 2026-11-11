import type { CliContext } from '../cli/context.js';
import { CliError } from '../contracts/errors.js';
import type { ResultEnvelope } from '../contracts/envelope.js';
import { renderTable } from './table.js';

const profiles: Record<
  string,
  { title: string; fields: string[]; labels: Record<string, string> }
> = {
  'symbol.search': {
    title: '标的检索',
    fields: ['thscode', 'name', 'asset_type', 'exchange', 'currency'],
    labels: {
      thscode: '代码',
      name: '名称',
      asset_type: '资产类型',
      exchange: '交易所',
      currency: '币种',
    },
  },
  'symbol.list': {
    title: '标的目录',
    fields: ['thscode', 'name', 'asset_type', 'exchange', 'currency'],
    labels: {
      thscode: '代码',
      name: '名称',
      asset_type: '资产类型',
      exchange: '交易所',
      currency: '币种',
    },
  },
  'market.snapshot': {
    title: '行情快照',
    fields: ['thscode', 'last_price', 'price_change_ratio_pct', 'volume', 'turnover'],
    labels: {
      thscode: '代码',
      last_price: '最新价(CNY)',
      price_change_ratio_pct: '涨跌幅(%)',
      volume: '成交量(股)',
      turnover: '成交额(CNY)',
    },
  },
  'market.history': {
    title: '历史日线',
    fields: [
      'thscode',
      'date_ms',
      'date',
      'open_price',
      'high_price',
      'low_price',
      'close_price',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'turnover',
      'amount',
    ],
    labels: {
      thscode: '代码',
      date_ms: '日期',
      date: '日期',
      open_price: '开盘(CNY)',
      high_price: '最高(CNY)',
      low_price: '最低(CNY)',
      close_price: '收盘(CNY)',
      open: '开盘(CNY)',
      high: '最高(CNY)',
      low: '最低(CNY)',
      close: '收盘(CNY)',
      volume: '成交量(股)',
      turnover: '成交额(CNY)',
      amount: '成交额(CNY)',
    },
  },
  'valuation.snapshot': {
    title: '估值快照',
    fields: ['thscode', 'name', 'pe_ttm', 'pe_mrq', 'pb_mrq', 'ps_ttm', 'pcf_ttm'],
    labels: {
      thscode: '代码',
      name: '名称',
      pe_ttm: 'PE(TTM)',
      pe_mrq: 'PE(MRQ)',
      pb_mrq: 'PB(MRQ)',
      ps_ttm: 'PS(TTM)',
      pcf_ttm: 'PCF(TTM)',
    },
  },
};

let shanghaiTime: Intl.DateTimeFormat | undefined;

function timestamp(value: unknown, dateOnly = false): unknown {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isFinite(new Date(value).getTime())
  )
    return value;
  shanghaiTime ??= new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const text = shanghaiTime.format(new Date(value));
  return dateOnly ? text.slice(0, 10) : `${text} Asia/Shanghai`;
}

function details(value: unknown, width: number, maxRows: number): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return renderTable(value, width, maxRows);
  return Object.entries(value)
    .map(([key, entry]) =>
      entry !== null && typeof entry === 'object'
        ? renderTable(`${key}:`, width) + renderTable(entry, width, maxRows)
        : renderTable(`${key}: ${String(entry)}`, width),
    )
    .join('');
}

function columnLabel(
  field: string,
  labels: Record<string, string> | undefined,
  zh: boolean,
): string {
  const label = labels?.[field];
  if (!label) return field;
  if (zh) return label;
  if (field === 'date_ms') return 'date (Asia/Shanghai)';
  const unit = /\((CNY|股|%)\)/u.exec(label)?.[1];
  return unit ? `${field} (${unit === '股' ? 'shares' : unit})` : field;
}

function validateColumns(fields: readonly string[] | undefined, rows: readonly unknown[]): void {
  if (!fields || fields.includes('*')) return;
  if (
    fields.some(
      (field) =>
        !rows.some((row) => row !== null && typeof row === 'object' && Object.hasOwn(row, field)),
    )
  )
    throw new CliError({
      code: 'CLI_BAD_ARGUMENT',
      category: 'validation',
      message: 'A selected column is absent from the returned records.',
      hint: 'Use --columns "*" to inspect available fields.',
      retryable: false,
      exitCode: 2,
    });
}

/** Presentation of returned data only; no enrichment requests or numeric coercion. */
export function renderDataView(result: ResultEnvelope<unknown>, context: CliContext): string {
  const width = context.stdout.columns;
  const data = result.data;
  const wrapper =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const rows = Array.isArray(data) ? data : Array.isArray(wrapper?.item) ? wrapper.item : undefined;
  const maxRows = context.maxRows ?? 20;
  if (wrapper && typeof wrapper.path === 'string' && typeof wrapper.format === 'string')
    return details(data, width, maxRows);
  if (!rows) {
    validateColumns(context.tableColumns, [data]);
    const selected =
      wrapper && context.tableColumns && !context.tableColumns.includes('*')
        ? Object.fromEntries(context.tableColumns.map((field) => [field, wrapper[field]]))
        : data;
    return details(selected, width, maxRows);
  }
  const visible = maxRows === 0 ? rows : rows.slice(0, maxRows);
  const zh = context.language === 'zh-CN';
  const profile = profiles[result.command];
  const title = zh && profile ? profile.title : result.command;
  const parts = [
    renderTable(
      zh
        ? `${title} · 本次返回 ${rows.length} 条 · 展示 ${visible.length} 条`
        : `${title} · returned ${rows.length} · showing ${visible.length}`,
      width,
    ),
  ];
  if (result.meta.source)
    parts.push(
      renderTable(
        `${zh ? '数据源' : 'source'}: ${result.meta.source}${result.meta.adjust ? ` · adjust: ${result.meta.adjust}` : ''}`,
        width,
      ),
    );
  if (wrapper) {
    const metadata = { ...wrapper };
    delete metadata.item;
    if (profile && 'timestamp' in metadata) {
      metadata[
        zh
          ? result.command === 'valuation.snapshot'
            ? '指标元数据时间'
            : '数据就绪时间'
          : result.command === 'valuation.snapshot'
            ? 'indicator_metadata_at'
            : 'data_ready_at'
      ] = timestamp(metadata.timestamp);
      delete metadata.timestamp;
    }
    if (Object.keys(metadata).length) parts.push(details(metadata, width, maxRows));
  }
  if (
    visible.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row)) &&
    visible.length
  ) {
    const records = visible as Record<string, unknown>[];
    const available = [...new Set(records.flatMap((row) => Object.keys(row)))];
    const requested = context.tableColumns;
    validateColumns(requested, rows);
    const defaults = profile?.fields.filter((field) => available.includes(field));
    const fields = requested?.includes('*')
      ? available
      : (requested ?? (defaults?.length ? defaults : available));
    const labels = fields.map((field) => columnLabel(field, profile?.labels, zh));
    const projected = records.map((row) =>
      Object.fromEntries(
        fields.map((field, index) => [
          labels.indexOf(labels[index]!) === labels.lastIndexOf(labels[index]!)
            ? labels[index]!
            : `${labels[index]} [${field}]`,
          profile && field === 'date_ms' ? timestamp(row[field], true) : row[field],
        ]),
      ),
    );
    parts.push(renderTable(projected, width));
    const hidden = available.filter((field) => !fields.includes(field)).length;
    if (hidden)
      parts.push(
        renderTable(
          zh
            ? `另有 ${hidden} 列；--columns "*" 查看全部字段。`
            : `${hidden} more columns; use --columns "*" for all fields.`,
          width,
        ),
      );
  } else parts.push(renderTable(visible, width));
  if (visible.length < rows.length)
    parts.push(
      renderTable(
        zh
          ? '预览已限制；--max-rows 0 查看本次全部结果，或使用 --output 导出。'
          : 'Preview limited; use --max-rows 0 for this result, or export with --output.',
        width,
      ),
    );
  return parts.join('\n');
}
