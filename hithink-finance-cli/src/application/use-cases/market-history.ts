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
import { queryReadOnly } from './local-query.js';
import { withDuckDbInterrupt } from '../../infrastructure/duckdb/connection.js';

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

const day = 86_400_000;
const shanghaiOffset = 8 * 3_600_000;

function weekday(date: number, direction: -1 | 1): string {
  const utcDay = new Date(date).getUTCDay();
  if (utcDay === 0) date += day * (direction === 1 ? 1 : -2);
  if (utcDay === 6) date += day * (direction === 1 ? 2 : -1);
  return new Date(date).toISOString().slice(0, 10);
}

export async function symbolsEligibleForRawForwardHistory(
  connection: DuckDBConnection,
  { thscodes, start }: { thscodes: readonly string[]; start: string },
  signal: AbortSignal,
): Promise<ReadonlySet<string>> {
  // A later corporate action can reprice earlier bars. Use raw prices only with a current dump.
  const proof = await withDuckDbInterrupt(connection, signal, () =>
    connection.runAndReadAll(
      `SELECT requested.thscode FROM (SELECT unnest(string_split($codes, ',')) AS thscode) requested
       WHERE (SELECT max(date) FROM raw_kline_daily) >= $latest_required::DATE
         AND EXISTS (SELECT 1 FROM _meta WHERE key = 'last_adjustment_release_id')
         AND NOT EXISTS (SELECT 1 FROM raw_adjustment_events
           WHERE ex_date >= $start::DATE AND thscode = requested.thscode)`,
      {
        codes: thscodes.join(','),
        start,
        latest_required: weekday(Date.now() + shanghaiOffset, -1),
      },
    ),
  );
  return new Set(
    proof.getRowsJson().flatMap(([symbol]) => (typeof symbol === 'string' ? [symbol] : [])),
  );
}

/**
 * Return an empty result for a confirmed no-bar window, or undefined when local coverage is uncertain.
 * The coverage check can only see dates present in the market-wide data.
 */
export async function readCompatibleHistory(
  connection: DuckDBConnection,
  request: {
    thscodes: readonly string[];
    startMs: number;
    endMs: number;
    adjust: 'none' | 'forward' | 'backward';
  },
  signal: AbortSignal,
): Promise<Record<string, unknown>[] | undefined> {
  const { thscodes, startMs, endMs, adjust } = request;
  const firstBar = Math.ceil((startMs + shanghaiOffset) / day) * day;
  const lastBar = Math.floor((endMs + shanghaiOffset) / day) * day;
  const start = new Date(firstBar).toISOString().slice(0, 10);
  const end = new Date(lastBar).toISOString().slice(0, 10);
  const params = { start, end, codes: thscodes.join(',') };
  const coverage = await withDuckDbInterrupt(connection, signal, () =>
    connection.runAndReadAll(
      `SELECT min(date)::VARCHAR, max(date)::VARCHAR,
          (SELECT count(DISTINCT thscode)::INTEGER FROM raw_kline_daily
            WHERE thscode IN (SELECT unnest(string_split($codes, ',')))),
          (SELECT count(DISTINCT date)::INTEGER FROM raw_kline_daily
            WHERE date BETWEEN $start::DATE AND $end::DATE)
        FROM raw_kline_daily`,
      params,
    ),
  );
  const [earliest, latest, known, sessions] = coverage.getRowsJson()[0] ?? [];
  if (
    typeof earliest !== 'string' ||
    typeof latest !== 'string' ||
    known !== thscodes.length ||
    typeof sessions !== 'number' ||
    (firstBar > lastBar ? earliest > end : earliest > weekday(firstBar, 1)) ||
    latest < weekday(lastBar, -1)
  )
    return undefined;
  if (sessions === 0) return firstBar > lastBar || weekday(firstBar, 1) > end ? [] : undefined;
  if (adjust === 'backward') return undefined;
  if (adjust === 'forward') {
    const eligible = await symbolsEligibleForRawForwardHistory(
      connection,
      { thscodes, start },
      signal,
    );
    if (eligible.size !== thscodes.length) return undefined;
  }
  const rows = await getHistory(connection, { thscodes, start, end, adjust: 'none' }, signal);
  return rows.length === sessions * thscodes.length ? rows : undefined;
}

export function restHistoryData(rows: readonly Record<string, unknown>[]) {
  const item = rows.map((row) => ({
    date_ms: Date.parse(String(row.date) + 'T00:00:00+08:00'),
    open_price: row.open,
    high_price: row.high,
    low_price: row.low,
    close_price: row.close,
    volume: row.volume,
    turnover: row.amount,
  }));
  return { timestamp: item.at(-1)?.date_ms ?? null, item };
}
