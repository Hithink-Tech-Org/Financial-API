/**
 * 行情历史查询用例 — 从本地 DuckDB 查询股票日线历史数据。
 *
 * ## SQL 注入防护
 * 所有用户输入通过以下方式安全拼入 SQL：
 * - thscode：对每个代码执行 `replaceAll("'", "''")` 转义单引号，然后用单引号包裹
 * - start/end 日期：格式化为 `DATE 'YYYY-MM-DD'` 字面量（由调用方保证格式合法性）
 * - 所有值通过 `queryReadOnly` 执行，该函数强制只读 SELECT
 *
 * ## 视图选择
 * 根据 adjust 参数选择对应的复权视图：
 * - 'none'     → v_daily（不复权）
 * - 'forward'  → v_daily_qfq（前复权，默认）
 * - 'backward' → v_daily_hfq（后复权）
 */
import type { DuckDBConnection } from '@duckdb/node-api';
import { z } from 'zod';
import { queryReadOnly } from './local-query.js';
import { withDuckDbInterrupt } from '../../infrastructure/duckdb/connection.js';
import { CliError } from '../../contracts/errors.js';
import type { FuyaoSuccess } from '../../infrastructure/fuyao/client.js';
import { dayMs, readMarketCalendar, shanghaiDate, shanghaiDay } from './market-calendar.js';

/**
 * 查询指定股票的日线行情历史。
 *
 * @param connection   - DuckDB 数据库连接
 * @param input.thscodes - 同花顺股票代码列表
 * @param input.start    - 起始日期（ISO 格式 YYYY-MM-DD）
 * @param input.end      - 结束日期（ISO 格式 YYYY-MM-DD）
 * @param input.adjust   - 复权方式：none / forward(前复权) / backward(后复权)，默认 forward
 * @returns 按 thscode, date 排序的行情数据行
 */
export async function getHistory(
  connection: DuckDBConnection,
  input: {
    thscodes: readonly string[];
    start?: string;
    end?: string;
    adjust?: 'none' | 'forward' | 'backward';
  },
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  // 选择复权视图
  const view =
    input.adjust === 'backward'
      ? 'v_daily_hfq' // 后复权
      : input.adjust === 'none'
        ? 'v_daily' // 不复权
        : 'v_daily_qfq'; // 前复权（默认）
  // 转义并拼接股票代码（防御 SQL 注入：对单引号做转义）
  const codes = input.thscodes.map((code) => `'${code.replaceAll("'", "''")}'`).join(',');
  // 构造 WHERE 条件
  const filters = [`thscode IN (${codes || "''"})`];
  if (input.start !== undefined) filters.push(`date >= DATE '${input.start}'`);
  if (input.end !== undefined) filters.push(`date <= DATE '${input.end}'`);
  // 通过只读查询接口执行（内部强制 SELECT 验证）
  return queryReadOnly(
    connection,
    `SELECT * FROM ${view} WHERE ${filters.join(' AND ')} ORDER BY thscode,date`,
    signal,
  );
}

export interface DailyHistoryRequest {
  thscodes: readonly string[];
  startMs: number;
  endMs: number;
  adjust: 'none' | 'forward' | 'backward';
}

const barSchema = z.object({ date_ms: z.number().int().nonnegative() }).passthrough();
type HistoryBar = z.infer<typeof barSchema>;
const batchSchema = z.object({
  interval: z.literal('1d'),
  adjust: z.literal('none'),
  item: z.array(
    z.object({
      thscode: z.string(),
      timestamp: z.number().int().nonnegative().nullable(),
      item: z.array(barSchema),
    }),
  ),
});

interface LocalHistory {
  firstKnown: number;
  lastKnown: number;
  sessions: number[];
  bars: Map<string, Map<number, HistoryBar>>;
  singleRows?: Record<string, unknown>[];
}

function historyBar(row: Record<string, unknown>): HistoryBar {
  return {
    date_ms: Date.parse(String(row.date) + 'T00:00:00+08:00'),
    open_price: row.open,
    high_price: row.high,
    low_price: row.low,
    close_price: row.close,
    volume: row.volume,
    turnover: row.amount,
  };
}

export async function readLocalHistory(
  connection: DuckDBConnection,
  request: DailyHistoryRequest,
  signal: AbortSignal,
): Promise<LocalHistory | undefined> {
  const { thscodes, startMs, endMs, adjust } = request;
  const snapshot = await readMarketCalendar(connection, signal);
  if (!snapshot) return undefined;
  const calendar = snapshot.days;
  const firstKnown = calendar[0]!;
  const lastKnown = snapshot.through;
  if (shanghaiDay(startMs) > lastKnown || endMs < firstKnown) return undefined;
  const sessions = calendar.filter((date) => date >= startMs && date <= endMs);
  // Dump release identifiers do not attest adjustment event coverage through the pricing date.
  if (sessions.length > 0 && adjust !== 'none') return undefined;

  const known = await withDuckDbInterrupt(connection, signal, () =>
    connection.runAndReadAll(
      `SELECT thscode FROM dim_symbol
         WHERE asset_type='a-share' AND thscode IN (SELECT unnest(string_split($codes, ',')))
       UNION
       SELECT DISTINCT thscode FROM raw_kline_daily
         WHERE thscode IN (SELECT unnest(string_split($codes, ',')))`,
      { codes: thscodes.join(',') },
    ),
  );
  const bars: LocalHistory['bars'] = new Map();
  for (const [code] of known.getRowsJson()) {
    if (typeof code === 'string') bars.set(code, new Map());
  }
  if (sessions.length === 0 || bars.size === 0) return { firstKnown, lastKnown, sessions, bars };
  const rows = await getHistory(
    connection,
    {
      thscodes,
      start: shanghaiDate(sessions[0]!),
      end: shanghaiDate(sessions.at(-1)!),
      adjust: 'none',
    },
    signal,
  );
  const expected = new Set(sessions);
  for (const row of rows) {
    const bar = historyBar(row);
    if (!expected.has(bar.date_ms)) return undefined;
    bars.get(String(row.thscode))?.set(bar.date_ms, bar);
  }
  return {
    firstKnown,
    lastKnown,
    sessions,
    bars,
    ...(thscodes.length === 1 && { singleRows: rows }),
  };
}

interface Gap {
  startMs: number;
  endMs: number;
  thscodes: string[];
}

function historyGaps(
  { thscodes, startMs, endMs }: DailyHistoryRequest,
  { firstKnown, lastKnown, sessions, bars }: LocalHistory,
): Gap[] {
  const gaps = new Map<string, Gap>();
  function add(code: string, first: number, last: number) {
    const key = `${first}:${last}`;
    const existing = gaps.get(key);
    if (existing) existing.thscodes.push(code);
    else gaps.set(key, { startMs: first, endMs: last, thscodes: [code] });
  }
  for (const code of thscodes) {
    const series = bars.get(code);
    if (!series) {
      add(code, startMs, endMs);
      continue;
    }
    if (startMs < firstKnown) add(code, startMs, firstKnown - 1);
    let first: number | undefined;
    let last: number | undefined;
    for (const day of sessions) {
      if (!series.has(day)) {
        first ??= day;
        last = day;
      } else if (first !== undefined) {
        add(code, first, last!);
        first = undefined;
      }
    }
    if (first !== undefined) add(code, first, last!);
    if (endMs >= lastKnown + dayMs) add(code, lastKnown + dayMs, endMs);
  }
  return [...gaps.values()];
}

function invalidBatch(message: string, requestId?: string): CliError {
  return new CliError({
    code: 'UPSTREAM_INVALID_RESPONSE',
    category: 'upstream',
    message,
    hint: 'Retry later and retain the request ID when reporting a persistent failure.',
    exitCode: 4,
    retryable: false,
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function historySeries(bars: Map<number, HistoryBar>, remoteTimes?: Map<number, number | null>) {
  const item = [...bars.values()].sort((left, right) => left.date_ms - right.date_ms);
  const latest = item.at(-1)?.date_ms;
  const remoteTime = latest === undefined ? undefined : remoteTimes?.get(latest);
  return { timestamp: remoteTime === undefined ? (latest ?? null) : remoteTime, item };
}

export function completeLocalHistory(
  request: DailyHistoryRequest,
  local: LocalHistory,
  batch: boolean,
) {
  if (historyGaps(request, local).length !== 0) return undefined;
  if (!batch) return local.singleRows ?? [];
  return {
    interval: '1d',
    adjust: request.adjust,
    item: request.thscodes.map((thscode) => ({
      thscode,
      ...historySeries(local.bars.get(thscode)!),
    })),
  };
}

export async function fillUnadjustedBatchHistory(
  request: DailyHistoryRequest,
  local: LocalHistory,
  load: (gap: Gap) => Promise<FuyaoSuccess<unknown>>,
): Promise<{ source: 'local' | 'mixed'; data: unknown; requestId?: string } | undefined> {
  if (request.adjust !== 'none' || ![...local.bars.values()].some((series) => series.size > 0))
    return undefined;
  const gaps = historyGaps(request, local);
  const sessions = new Set(local.sessions);
  const timestamps = new Map<string, Map<number, number | null>>();
  let requestId: string | undefined;
  let contributed = false;
  for (const gap of gaps) {
    const expected = new Set(gap.thscodes);
    let result;
    try {
      result = await load(gap);
    } catch (error) {
      if (
        error instanceof CliError &&
        ['FUYAO_3001', 'FUYAO_3004'].includes(error.code) &&
        gap.thscodes.every((code) => !local.bars.has(code))
      )
        continue;
      throw error;
    }
    requestId = result.requestId ?? requestId;
    const parsed = batchSchema.safeParse(result.data);
    if (!parsed.success)
      throw invalidBatch('Invalid batch history after remote gap fill.', requestId);
    for (const group of parsed.data.item) {
      if (!expected.delete(group.thscode))
        throw invalidBatch('Unexpected symbol in batch history gap fill.', requestId);
      const rows = local.bars.get(group.thscode) ?? new Map<number, HistoryBar>();
      const seen = new Set<number>();
      for (const row of group.item) {
        const inKnownCalendar = row.date_ms >= local.firstKnown && row.date_ms <= local.lastKnown;
        if (
          row.date_ms < gap.startMs ||
          row.date_ms > gap.endMs ||
          shanghaiDay(row.date_ms) !== row.date_ms ||
          (inKnownCalendar && !sessions.has(row.date_ms)) ||
          seen.has(row.date_ms)
        )
          throw invalidBatch('Invalid bar date in batch history gap fill.', requestId);
        seen.add(row.date_ms);
        rows.set(row.date_ms, row);
      }
      const latest = Math.max(...seen);
      if (Number.isFinite(latest)) {
        const times = timestamps.get(group.thscode) ?? new Map<number, number | null>();
        times.set(latest, group.timestamp);
        timestamps.set(group.thscode, times);
      }
      local.bars.set(group.thscode, rows);
      contributed = true;
    }
    if ([...expected].some((code) => local.bars.has(code)))
      throw invalidBatch('A known symbol is absent from batch history gap fill.', requestId);
  }
  return {
    source: contributed ? 'mixed' : 'local',
    data: {
      interval: '1d',
      adjust: 'none',
      item: request.thscodes.flatMap((thscode) => {
        const bars = local.bars.get(thscode);
        return bars ? [{ thscode, ...historySeries(bars, timestamps.get(thscode)) }] : [];
      }),
    },
    ...(requestId === undefined ? {} : { requestId }),
  };
}
