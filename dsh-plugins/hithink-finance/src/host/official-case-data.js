import { cancelled, FinanceError, publicError } from './cli.js';
import { isRecord, runWorkbenchQuery } from './workbench-data.js';

export const day = 86_400_000;
export const shanghaiDate = (time) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(time);
export const midnight = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? Date.parse(`${date}T00:00:00+08:00`) : NaN;

export function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function timestamp(value) {
  const result = number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function ordered(rows, field) {
  return rows.filter((row) => timestamp(row[field]) !== null).sort((a, b) => Number(a[field]) - Number(b[field]));
}

const invalidResponse = () => new FinanceError('FINANCE_INVALID_RESPONSE', '数据服务返回的结果结构不完整，请重试。');
const fetchTimeout = () => new FinanceError('FINANCE_TIMEOUT', '数据刷新超时，请重试。');

export function createOfficialCaseData(cli, signal) {
  const controller = AbortSignal.timeout(60_000);
  const callSignal = AbortSignal.any([signal, controller]);
  const freshness = [];
  const failures = [];
  const slots = Array.from({ length: 4 }, () => Promise.resolve());
  let nextSlot = 0;

  function mark(receipt, status, message) {
    if (receipt.status === 'error') return;
    receipt.status = status;
    receipt.message = message;
  }

  function read(command, label, params = {}, { fields = ['item'], date, max = 400, source = 'remote' } = {}) {
    const receipt = { label, source: null, command, updated_at: null, fetched_at: null, status: 'ok', count: 0 };
    freshness.push(receipt);
    const slot = nextSlot++ % slots.length;
    const operation = slots[slot].then(async () => {
      if (signal.aborted) throw cancelled();
      try {
        if (controller.aborted) throw fetchTimeout();
        const argv = ['--source', source, ...command.split('.'),
          ...Object.entries(params).flatMap(([key, value]) => [`--${key}`, String(value)])];
        const { data, meta, truncated } = await runWorkbenchQuery(cli, command, { source, argv }, callSignal, 1024 * 1024);
        receipt.source = meta.source;
        receipt.fetched_at = Date.parse(meta.fetchedAt);
        if (meta.requestId) receipt.request_id = meta.requestId;
        if (!isRecord(data) || fields.some((field) => !Array.isArray(data[field]))) throw invalidResponse();
        const rows = data[fields[0]].filter(isRecord);
        receipt.count = fields.reduce((total, field) => total + data[field].filter(isRecord).length, 0);
        receipt.updated_at = timestamp(date?.(data, rows));
        if (truncated || fields.some((field) => data[field].length > max)) {
          mark(receipt, 'partial', '只展示本页的有界样本。');
        } else if (fields.some((field) => data[field].some((row) => !isRecord(row)))) {
          mark(receipt, 'partial', '部分记录结构无效。');
        } else if (receipt.count === 0) {
          mark(receipt, 'empty', '当前条件下暂无数据。');
        }
        const result = { ...data };
        for (const field of fields) result[field] = data[field].filter(isRecord).slice(0, max);
        return { rows: result[fields[0]], data: result, receipt };
      } catch (error) {
        if (signal.aborted) throw cancelled();
        const safe = controller.aborted ? fetchTimeout() : error instanceof FinanceError ? error : invalidResponse();
        failures.push(safe);
        const detail = publicError(safe);
        receipt.status = 'error';
        receipt.code = detail.code;
        receipt.message = detail.message;
        if (detail.requestId) receipt.request_id = detail.requestId;
        return { rows: [], data: null, receipt };
      }
    });
    slots[slot] = operation.catch(() => {});
    return operation;
  }

  function finish(id, title, data) {
    if (signal.aborted) throw cancelled();
    if (failures.length === freshness.length) {
      throw failures.find((error) => error.code.startsWith('AUTH_') || ['FUYAO_2001', 'FUYAO_2003'].includes(error.code)) ?? failures[0];
    }
    const nonempty = freshness.some((part) => part.count > 0 && part.status !== 'empty' && part.status !== 'error');
    const complete = freshness.every((part) => part.status === 'ok');
    const incomplete = freshness.some((part) => ['error', 'partial'].includes(part.status));
    const status = complete ? 'ok' : nonempty || incomplete ? 'partial' : 'empty';
    const warnings = freshness.filter((part) => part.message).map((part) => `${part.label}：${part.message}`);
    return { id, title, mode: 'live', generated_at: Date.now(), status, freshness, warnings, ...data };
  }

  return { read, finish, mark, settle: () => Promise.all(slots) };
}
