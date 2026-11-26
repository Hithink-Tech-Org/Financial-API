import type { DuckDBConnection } from '@duckdb/node-api';
import { z } from 'zod';
import type { AuthSession } from '../ports/auth-provider.js';
import { throwIfCancelled } from '../../contracts/errors.js';
import { withDuckDbInterrupt } from '../../infrastructure/duckdb/connection.js';
import { FuyaoClient } from '../../infrastructure/fuyao/client.js';

export const dayMs = 86_400_000;
export const shanghaiOffset = 8 * 3_600_000;
const calendarKey = 'market_history_calendar';

export function shanghaiDay(milliseconds: number): number {
  return Math.floor((milliseconds + shanghaiOffset) / dayMs) * dayMs - shanghaiOffset;
}

export function shanghaiDate(milliseconds: number): string {
  return new Date(milliseconds + shanghaiOffset).toISOString().slice(0, 10);
}

const dates = z
  .array(z.number().int().nonnegative())
  .min(2)
  .max(367)
  .refine(
    (days) =>
      days.at(-1)! - days[0]! <= 367 * dayMs &&
      days.every(
        (date, index) => shanghaiDay(date) === date && (index === 0 || date > days[index - 1]!),
      ),
  );

const response = z.object({
  timestamp: z.number().int().nonnegative(),
  item: z
    .array(z.object({ date_ms: z.number().int().nonnegative(), date: z.string() }))
    .min(2)
    .max(367),
});

const marketCalendar = z
  .object({ days: dates, through: z.number().int().nonnegative() })
  .refine(
    ({ days, through }) =>
      shanghaiDay(through) === through &&
      through >= days.at(-1)! &&
      through - days[0]! <= 367 * dayMs,
  );
type MarketCalendar = z.infer<typeof marketCalendar>;

export async function fetchMarketCalendar(options: {
  baseUrl: string;
  auth: AuthSession;
  signal?: AbortSignal;
}): Promise<MarketCalendar | undefined> {
  const { baseUrl, auth, signal } = options;
  const requestedThrough = shanghaiDay(Date.now());
  try {
    const { data } = await new FuyaoClient({
      baseUrl,
      auth,
      maxAttempts: 1,
      timeoutMs: 5_000,
      ...(signal === undefined ? {} : { signal }),
    }).request({ path: '/api/a-share/calendar/trading-days', schema: response });
    // The default calendar response lists trading dates through its Shanghai response day.
    const parsed = marketCalendar.safeParse({
      days: data.item.map((item) => item.date_ms),
      through: Math.min(requestedThrough, shanghaiDay(data.timestamp)),
    });
    if (!parsed.success) return undefined;
    if (data.item.some((item) => shanghaiDate(item.date_ms).replaceAll('-', '') !== item.date))
      return undefined;
    return parsed.data;
  } catch {
    // The trading calendar improves local coverage without making the data import depend on it.
    throwIfCancelled(signal);
    return undefined;
  }
}

export async function saveMarketCalendar(
  connection: DuckDBConnection,
  calendar: MarketCalendar,
): Promise<void> {
  await connection.run('INSERT OR REPLACE INTO _meta VALUES ($key,$value)', {
    key: calendarKey,
    value: JSON.stringify(calendar),
  });
}

export async function readMarketCalendar(
  connection: DuckDBConnection,
  signal: AbortSignal,
): Promise<MarketCalendar | undefined> {
  const reader = await withDuckDbInterrupt(connection, signal, () =>
    connection.runAndReadAll('SELECT value FROM _meta WHERE key=$key', { key: calendarKey }),
  );
  const value = reader.getRowsJson()[0]?.[0];
  if (typeof value !== 'string') return undefined;
  try {
    const cached: unknown = JSON.parse(value);
    const parsed = marketCalendar.safeParse(
      Array.isArray(cached) ? { days: cached, through: cached.at(-1) } : cached,
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
