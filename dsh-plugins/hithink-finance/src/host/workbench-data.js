import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { checkedEnvelope, FinanceError, requestId } from './cli.js';

const day = 86_400_000;
const maxWindow = 400 * day;
const maxQueries = 12;
const maxManifestBytes = 12 * 1024;
const bindingName = /^[a-z][a-z0-9_-]{0,47}$/i;
const code = /^[a-z0-9]{1,12}\.[a-z0-9]{1,8}$/i;
const codes = (value) => typeof value === 'string' && value.length <= 240 &&
  value.split(',').length <= 12 && value.split(',').every((entry) => code.test(entry));
const ticker = (value) => typeof value === 'string' && code.test(value);
const batchTickers = (value) => codes(value) && value.split(',').length <= 10;
const test = (pattern) => (value) => typeof value === 'string' && pattern.test(value);
const option = test(/^[a-z0-9][a-z0-9-,]{0,31}$/i);
const integer = (minimum, maximum) => (value) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const epoch = integer(0, Date.UTC(2100, 0, 1));
const calendar = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const limit = integer(1, 50);
const dates = { 'start-ms': epoch, 'end-ms': epoch };
const single = { thscode: ticker };
const many = { thscodes: codes };
const history = { ...single, ...dates };
const statement = { ...single, ...dates, period: option, limit };

const commands = new Map(Object.entries({
  'market.snapshot': { fields: { ...many, limit, offset: integer(0, 1000) }, required: ['thscodes'] },
  'market.history': {
    fields: { ...history, adjust: option }, sources: ['auto', 'local', 'remote'],
  },
  'market.history-batch': {
    fields: { thscodes: batchTickers, ...dates, adjust: option, interval: (value) => value === '1d' },
    sources: ['auto', 'local', 'remote'],
  },
  'market.adjustment-factors': {
    fields: { ...single, start: calendar, end: calendar },
    required: ['start', 'end'], sources: ['auto', 'local'], defaultSource: 'local',
  },
  'index.snapshot': { fields: many },
  'index.history': { fields: history },
  'fund.snapshot': { fields: single },
  'fund.history': { fields: { ...history, interval: option } },
  'fund.nav': { fields: { ...single, range: option, 'nav-type': option } },
  'financials.income': { fields: statement },
  'financials.balance-sheet': { fields: statement },
  'financials.cash-flow': { fields: statement },
  'financials.indicators': { fields: { ...single, report: test(/^\d{4}-[1-4]$/) } },
  'valuation.snapshot': { fields: many },
}));

export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function invalidQuery(message) {
  return new FinanceError('FINANCE_WORKBENCH_INVALID_QUERY', message);
}

function validateArgs(rule, params, deferred = []) {
  if (!isRecord(params) || Object.keys(params).length > Object.keys(rule.fields).length) {
    throw invalidQuery('查询参数应为声明所允许的对象。');
  }
  for (const [key, value] of Object.entries(params)) {
    if (!Object.hasOwn(rule.fields, key) || !rule.fields[key](value)) {
      throw invalidQuery('查询参数的名称、格式或范围无效。');
    }
  }
  if (rule.required?.some((name) => !Object.hasOwn(params, name) && !deferred.includes(name))) {
    throw invalidQuery('查询缺少必需参数。');
  }
  const start = params['start-ms'] ?? (params.start && Date.parse(params.start));
  const end = params['end-ms'] ?? (params.end && Date.parse(params.end));
  if (start !== undefined && end !== undefined && (start > end || end - start > maxWindow)) {
    throw invalidQuery('日期区间应按时间排序且不超过 400 天。');
  }
}

function declaredOptions(value, allowed, defaultValue) {
  if (value === undefined) return defaultValue;
  if (!Array.isArray(value) || value.length > allowed.length ||
      value.some((name) => !allowed.includes(name)) || new Set(value).size !== value.length) {
    throw invalidQuery('查询声明包含未支持的数据源或可变参数。');
  }
  return value;
}

export function pageQueries(html) {
  const matches = [...html.matchAll(/<script\s+type\s*=\s*"application\/json"\s+id\s*=\s*"hithink-finance-data"\s*>([\s\S]*?)<\/script\s*>/gi)];
  if (matches.length === 0) return [];
  if (matches.length !== 1 || Buffer.byteLength(matches[0][1]) > maxManifestBytes) {
    throw invalidQuery('每个页面可声明一个不超过 12 KiB 的数据定义。');
  }
  let manifest;
  try {
    manifest = JSON.parse(matches[0][1]);
  } catch {
    throw invalidQuery('页面数据声明应为有效 JSON。');
  }
  if (manifest?.version !== 1 || !isRecord(manifest.queries) || Object.keys(manifest.queries).length > maxQueries) {
    throw invalidQuery('页面数据声明应使用版本 1 并包含最多 12 个查询。');
  }
  return Object.entries(manifest.queries).map(([name, value]) => {
    const rule = commands.get(value?.command);
    if (!bindingName.test(name) || !isRecord(value) || !rule ||
        Object.keys(value).some((key) => !['command', 'source', 'sources', 'params', 'inputs'].includes(key))) {
      throw invalidQuery('查询名称、命令或声明字段不受支持。');
    }
    const allowedSources = rule.sources ?? ['auto', 'remote'];
    const source = value.source ?? rule.defaultSource ?? 'remote';
    const sources = declaredOptions(value.sources, allowedSources, [source]);
    if (!allowedSources.includes(source) || !sources.includes(source)) {
      throw invalidQuery('当前命令不支持此数据源。');
    }
    const inputs = declaredOptions(value.inputs, Object.keys(rule.fields), []);
    const params = value.params ?? {};
    validateArgs(rule, params, inputs);
    return { name, command: value.command, source, sources, params, inputs };
  });
}

export function queryArguments(binding, params = {}, source = binding.source) {
  if (!isRecord(params) || Object.keys(params).some((key) => !binding.inputs.includes(key))) {
    throw invalidQuery('只能修改页面声明允许的查询参数。');
  }
  if (!binding.sources.includes(source)) throw invalidQuery('页面未声明此数据源。');
  const rule = commands.get(binding.command);
  const args = { ...binding.params, ...params };
  validateArgs(rule, args);
  return { source, params: args, argv: ['--source', source, ...binding.command.split('.'),
    ...Object.entries(args).flatMap(([key, value]) => [`--${key}`, String(value)])] };
}

const cliSchemas = new WeakMap();

function schema(cli, command, signal) {
  let cache = cliSchemas.get(cli);
  if (!cache) {
    cache = new Map();
    cliSchemas.set(cli, cache);
  }
  if (!cache.has(command)) {
    const pending = cli.run(['schema', command], { signal, timeoutMs: 8_000 }).then((result) => {
      const { data } = checkedEnvelope(result, 'schema');
      if (data?.id !== command || !Array.isArray(data.command) || data.command.join('.') !== command || !Array.isArray(data.options)) {
        throw new FinanceError('FINANCE_WORKBENCH_CLI_SCHEMA', '当前 CLI 未提供此工作台能力的有效契约。');
      }
      const entries = data.options.map((entry) => [/^--([a-z][a-z0-9-]*)\b/.exec(entry?.flags)?.[1], entry]);
      return { options: new Map(entries.filter(([key]) => key !== undefined)), coverage: data.local_history_coverage };
    }).catch((error) => {
      cache.delete(command);
      throw error;
    });
    cache.set(command, pending);
  }
  return cache.get(command);
}

export function createSchemaValidator(cli, signal) {
  return async function validate(binding, params = binding.params, inputs = binding.inputs) {
    const { options } = await schema(cli, binding.command, signal);
    for (const name of [...Object.keys(params), ...inputs]) {
      const spec = options.get(name);
      const value = params[name];
      if (!spec || (value !== undefined &&
          ((spec.type === 'string' && typeof value !== 'string') ||
           (spec.type === 'integer' && !Number.isSafeInteger(value)) ||
           (Array.isArray(spec.choices) && !spec.choices.includes(value))))) {
        throw invalidQuery('查询参数不符合当前 CLI 契约。');
      }
    }
    for (const [name, spec] of options) {
      if (spec.required === true && !Object.hasOwn(params, name) && !inputs.includes(name)) {
        throw invalidQuery('查询缺少当前 CLI 契约要求的参数。');
      }
    }
  };
}

async function requireLocalDatabase(cli, signal) {
  const config = checkedEnvelope(await cli.run(['config', 'show'], { signal }), 'config.show');
  const path = config.data?.db_path;
  if (typeof path === 'string' && isAbsolute(path)) {
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) return path;
  }
  throw new FinanceError('FINANCE_WORKBENCH_LOCAL_UNAVAILABLE', '请先在设置中初始化本地数据库。');
}

const queryErrors = {
  FINANCE_TIMEOUT: '数据刷新超时，请重试。',
  FINANCE_OUTPUT_TOO_LARGE: '查询结果超过页面上限，请缩小区间或减少标的。',
  CLI_BAD_ARGUMENT: 'CLI 无法使用当前查询参数，请检查该命令的契约。',
  DATA_INITIALIZATION_REQUIRED: '本地日线覆盖不足。请检查本地数据或改用自动选源。',
  DATA_LOCKED: '本地数据正在维护。请等待同步完成后刷新。',
  DB_READ_ONLY_VIOLATION: '本地行情库尚未就绪。请在设置中初始化或校验本地数据。',
  AUTH_LOGIN_REQUIRED: '请在金融数据账号页连接或重新连接账号。',
  FUYAO_2001: '当前凭证未通过认证，请在金融数据账号页重新连接。',
  FUYAO_2003: '当前凭证无法访问这项数据，请检查授权或重新连接账号。',
  UPSTREAM_NETWORK_FAILURE: '暂时无法连接金融数据服务，请检查网络后重试。',
};

function safeQueryError(error) {
  if (!(error instanceof FinanceError) || error.code.startsWith('FINANCE_WORKBENCH_')) return error;
  const message = queryErrors[error.code] ?? (error.code.startsWith('AUTH_')
    ? '请在金融数据账号页检查连接状态。'
    : '金融数据刷新失败，请检查数据范围后重试。');
  return new FinanceError(error.code, message, error.requestId);
}

export async function runPageQuery(cli, binding, query, signal) {
  if (binding.command === 'market.adjustment-factors') {
    await requireLocalDatabase(cli, signal).catch((error) => { throw safeQueryError(error); });
  }
  const { data, meta } = await runWorkbenchQuery(cli, binding.command, query, signal);
  return { data, meta };
}

function localHistoryPayload(rows) {
  const item = rows.map((row) => ({
    date_ms: Date.parse(`${row.date}T00:00:00+08:00`),
    open_price: row.open, high_price: row.high, low_price: row.low, close_price: row.close,
    volume: row.volume, turnover: row.amount,
  }));
  return { timestamp: item.at(-1)?.date_ms ?? null, item };
}

export async function runWorkbenchQuery(cli, command, { source, argv }, signal, maxCaptureBytes = 512 * 1024) {
  const localPanel = command === 'db.query';
  try {
    let args = localPanel ? ['--db', await requireLocalDatabase(cli, signal), ...argv] : argv;
    if (source !== 'remote' && ['market.history', 'market.history-batch'].includes(command) &&
        (await schema(cli, command, signal)).coverage !== 'trading-calendar') {
      if (source === 'local')
        throw new FinanceError('FINANCE_WORKBENCH_CLI_UPGRADE', '当前 CLI 版本无法验证本地日线覆盖。请更新金融数据插件。');
      source = 'remote';
      args = ['--source', source, ...argv.slice(2)];
    }
    const envelope = checkedEnvelope(await cli.run(args, {
      signal, timeoutMs: 25_000, maxCaptureBytes,
    }), command);
    const actual = envelope.meta?.source ?? (localPanel ? 'local' : undefined);
    if (!['local', 'remote', 'mixed'].includes(actual) || (source !== 'auto' && actual !== source)) {
      throw new FinanceError('FINANCE_WORKBENCH_SOURCE_MISMATCH', 'CLI 返回的数据来源与页面要求不一致。');
    }
    const id = requestId(envelope.meta?.request_id ?? envelope.meta?.requestId);
    let data = envelope.data;
    if (localPanel) data = { item: data };
    if (command === 'market.history' && actual === 'local' && Array.isArray(data))
      data = localHistoryPayload(data);
    return { data, meta: { source: actual, fetchedAt: new Date().toISOString(), ...(id ? { requestId: id } : {}) },
      truncated: envelope.meta?.truncated === true };
  } catch (error) {
    if (localPanel && error?.code === 'CLI_INTERNAL_ERROR') {
      throw new FinanceError(error.code, '无法打开本地行情库。请等待同步完成，或在设置中检查本地数据。', error.requestId);
    }
    throw safeQueryError(error);
  }
}
