import { cancelled, FinanceError, publicError } from './cli.js';
import { readWorkspaceText } from './workspace-file.js';

const TOOL_NAME = 'hithink_finance_render';
const TEMPLATES = ['table', 'snapshot', 'line', 'kline', 'ranking', 'financial', 'custom'];
const FORMATS = ['auto', 'text', 'number', 'integer', 'percent', 'ratio', 'currency', 'date', 'datetime'];
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_VIEW_BYTES = 128 * 1024;
const MAX_CELL_CHARS = 2048;
const MAX_SOURCE_BYTES = 32 * 1024;
const record = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const scalar = (value) => value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
const cliEnvelope = (value) => record(value) && typeof value.ok === 'boolean' && typeof value.command === 'string';

function invalid(message) {
  return new FinanceError('FINANCE_INVALID_RENDER_INPUT', message);
}

async function readResultFile(file, session, policy, signal) {
  const readError = new FinanceError('FINANCE_RESULT_FILE_INVALID', '请选择当前会话工作区内可读取的 UTF-8 JSON 结果文件。');
  const text = await readWorkspaceText(file, session, policy, signal, {
    extensions: ['.json'], maxBytes: MAX_FILE_BYTES, readError,
    workspaceError: new FinanceError('FINANCE_WORKSPACE_REQUIRED', '请在有工作区的会话中加载结果文件。'),
    pathError: invalid('file 应为会话工作区内的 JSON 文件路径。'),
    sizeError: invalid('JSON 文件超过 16 MiB，请在工作区内先缩小结果。'),
  });
  try {
    return JSON.parse(text);
  } catch {
    throw readError;
  }
}

function shortText(value, name, limit = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw invalid(`${name} 应为长度不超过 ${limit} 的非空文本。`);
  }
  return value;
}

function readPath(value, path) {
  if (!Array.isArray(path) || path.length > 8) throw invalid('JSON 路径最多包含 8 层键或数组下标。');
  let current = value;
  for (const key of path) {
    if (typeof key === 'string') shortText(key, 'JSON 路径键', 128);
    else if (!Number.isSafeInteger(key) || key < 0) throw invalid('JSON 数组下标应为非负整数。');
    current = current && typeof current === 'object' && Object.hasOwn(current, key) ? current[key] : undefined;
  }
  return current;
}

function getRows(source, path) {
  const envelope = cliEnvelope(source);
  if (envelope && !source.ok) throw invalid('结果表示 CLI 执行失败，请先检查原命令。');
  const value = path !== undefined ? readPath(source, path) : envelope ? source.data : source;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.item)) return value.item;
  if (record(value)) return [value];
  throw invalid('请选择 JSON 中包含记录的数组，或传入单条记录。');
}

function knownCliTime(value) {
  if (typeof value === 'string') {
    if (value.length > 64) return undefined;
    value = value.trim();
    if (!/^[+-]?\d+$/.test(value)) {
      return /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value) && Date.parse(value) > 0 ? value : undefined;
    }
    value = Number(value);
  }
  return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

function displayContext(input, source) {
  const envelope = cliEnvelope(source) && source.ok ? source : undefined;
  const result = {};
  const timing = (value) => typeof value === 'string' ? Boolean(value.trim() && value.length <= 64)
    : Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime());
  if (input.asOf !== undefined && !timing(input.asOf)) throw invalid('asOf 应为 Unix 毫秒值或不超过 64 字符的时点。');
  const asOf = input.asOf ?? knownCliTime(envelope?.data?.timestamp) ?? knownCliTime(envelope?.data?.as_of);
  if (asOf !== undefined) result.asOf = asOf;
  if (input.subtitle !== undefined) result.subtitle = shortText(input.subtitle, 'subtitle');
  const properties = {
    adjust: envelope?.data?.adjust ?? envelope?.meta?.adjust,
    interval: envelope?.data?.interval,
    origin: envelope?.data?.source ?? envelope?.meta?.source,
  };
  for (const [key, value] of Object.entries(properties)) {
    if (input[key] !== undefined) result[key] = shortText(input[key], key, 40);
    else if (typeof value === 'string' && value.trim() && value.length <= 40) result[key] = value;
  }
  return result;
}

function normalizeView(input, source) {
  const { template, rowsPath, fields, series, x, custom } = input;
  if (!TEMPLATES.includes(template)) throw invalid('template 应为工具列出的展示模板。');
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 24) {
    throw invalid('fields 应包含 1 到 24 个显示字段。');
  }
  const keys = new Set();
  const columns = fields.map(({ key, path, label, format, unit }) => {
    shortText(key, 'fields.key', 128);
    if (keys.has(key)) throw invalid('fields.key 应互不重复。');
    keys.add(key);
    if (format !== undefined && !FORMATS.includes(format)) throw invalid('请使用工具列出的字段格式。');
    if (path !== undefined) readPath(undefined, path);
    return {
      key,
      ...(label === undefined ? {} : { label: shortText(label, 'fields.label') }),
      ...(unit === undefined ? {} : { unit: shortText(unit, 'fields.unit', 32) }),
      ...(format === undefined ? {} : { format }),
    };
  });
  if (x !== undefined && !keys.has(x)) throw invalid('x 应引用 fields.key。');
  if (series !== undefined) {
    if (!Array.isArray(series) || series.length < 1 || series.length > 8 ||
        series.some(({ key, groupBy }) => !keys.has(key) || (groupBy !== undefined && !keys.has(groupBy)))) {
      throw invalid('series 应包含 1 到 8 个序列，key 和 groupBy 应引用 fields.key。');
    }
    for (const { label } of series) if (label !== undefined) shortText(label, 'series.label');
  }
  const view = {
    version: 1,
    template,
    ...(input.title === undefined ? {} : { title: shortText(input.title, 'title') }),
    ...displayContext(input, source),
    ...(x === undefined ? {} : { x }),
    ...(series === undefined ? {} : { series }),
    fields: columns,
    rows: [],
  };
  if (template === 'custom') {
    if (typeof custom?.source !== 'string' || !custom.source.trim() || Buffer.byteLength(custom.source) > MAX_SOURCE_BYTES) {
      throw invalid('custom.source 应为不超过 32 KiB 的 JavaScript 函数定义。');
    }
    if (custom.height !== undefined && (!Number.isInteger(custom.height) || custom.height < 160 || custom.height > 640)) {
      throw invalid('custom.height 应为 160 到 640 之间的整数。');
    }
    view.custom = { source: custom.source, ...(custom.height === undefined ? {} : { height: custom.height }) };
  } else if (custom !== undefined) throw invalid('custom 配置用于 custom 模板。');

  const rows = getRows(source, rowsPath);
  view.rowCount = rows.length;
  let bytes = Buffer.byteLength(JSON.stringify({ ...view, truncated: false })) + 1;
  let clippedCells = false;
  for (const row of rows.slice(0, MAX_ROWS)) {
    if (!record(row)) throw invalid('展示数据的每一行都应为 JSON 对象。');
    const projected = Object.fromEntries(fields.map(({ key, path = [key] }) => {
      const value = readPath(row, path);
      if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
        clippedCells = true;
        return [key, `${value.slice(0, MAX_CELL_CHARS)}…`];
      }
      if (value !== undefined && !scalar(value)) throw invalid('展示字段应指向文本、数字、布尔值或空值。');
      return [key, value ?? null];
    }));
    bytes += Buffer.byteLength(JSON.stringify(projected)) + 1;
    if (bytes > MAX_VIEW_BYTES) break;
    view.rows.push(projected);
  }
  view.truncated = view.rows.length < rows.length || clippedCells;
  return view;
}

export function createRender({ signal, getWorkspacePolicy }) {
  return async (input, exec) => {
    const callSignal = AbortSignal.any([signal, exec.signal]);
    try {
      if (callSignal.aborted) throw cancelled();
      if (Object.hasOwn(input, 'data') === Object.hasOwn(input, 'file')) {
        throw invalid('请从 data 和 file 中选择一种数据来源。');
      }
      const source = input.file === undefined ? input.data
        : await readResultFile(input.file, exec.agent?.session, getWorkspacePolicy(exec), callSignal);
      if (callSignal.aborted) throw cancelled();
      return { ok: true, view: normalizeView(input, source) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  };
}

const string = { type: 'string' };
const path = { type: 'array', items: { oneOf: [string, { type: 'integer' }] } };

export function renderTool(execute) {
  return {
    name: TOOL_NAME,
    description: '将已有金融数据呈现为 DSH 对话中的表格、图表或隔离的自定义组件。传入 JSON 或会话工作区中的 JSON 文件，选择字段和展示模板。',
    parameters: {
      data: { type: 'json', description: '已有记录、记录数组或 CLI JSON 响应。与 file 二选一。' },
      file: { ...string, description: '会话工作区中的 JSON 文件路径。与 data 二选一。' },
      rowsPath: { ...path, description: '从输入根节点到记录或记录数组的路径，使用键和数字下标。例如 ["data","item",0,"item"]。' },
      template: { type: 'string', enum: TEMPLATES, required: true },
      title: string,
      asOf: { oneOf: [string, { type: 'integer' }], description: '结果实际时点，使用 Unix 毫秒或带时区文本。' },
      subtitle: { ...string, description: '图表的区间、统计口径或必要说明。' },
      adjust: { ...string, description: '已确认的复权方式，例如 none、forward 或 backward。' },
      interval: { ...string, description: '已确认的周期，例如 1d。' },
      origin: { ...string, description: '已确认的数据来源。' },
      fields: { type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          key: { ...string, required: true }, path, label: string, unit: string,
          format: { type: 'string', enum: FORMATS, description: 'percent 的 1.2 表示 1.2%；ratio 的 0.012 表示 1.2%。' },
        },
      } },
      x: { ...string, description: '横轴或类别字段，引用 fields.key。' },
      series: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        key: { ...string, required: true }, label: string, groupBy: string,
      } } },
      custom: { type: 'object', additionalProperties: false, properties: {
        source: { ...string, required: true, description: '定义 render(rows, action) 的 JavaScript，返回 el(tag, children, props) 节点。action 初始为 null，按钮点击时为其 action 值。' },
        height: { type: 'integer' },
      } },
    },
    output: {
      schema: { type: 'json' },
      render(_args, value) {
        if (!value.ok) return [{ type: 'text', text: JSON.stringify(value) }];
        const { template, rows, rowCount, truncated } = value.view;
        return [{ type: 'text', text: JSON.stringify({ ok: true, template, displayedRows: rows.length, rowCount, truncated }) }];
      },
      presentationMeta(_args, value) {
        return value.ok ? value.view : null;
      },
    },
    execute,
  };
}
