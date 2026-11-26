import { createHash, randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { checkedEnvelope, FinanceError, publicError } from './cli.js';
import { dataActions, validSyncTime } from './data-remote.js';
import { managedDirectory, readJson, writeAtomic } from './workbench-files.js';
import { writeLocked } from './workbench-lock.js';

const defaultSchedule = { enabled: false, time: '08:00' };
const scheduleFile = 'schedule.json';
const timeZone = 'Asia/Shanghai';
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const actionTimeout = 30 * 60_000;
const staleAfter = 2 * actionTimeout;

function dataError(code, message) {
  return new FinanceError(code, message);
}

function activeJob(active, now) {
  if (!Number.isSafeInteger(active?.pid) || active.pid < 1 || !dataActions.includes(active.action) ||
      !Number.isFinite(active.startedAt) || now - active.startedAt >= staleAfter) return null;
  try {
    process.kill(active.pid, 0);
    return active;
  } catch (error) {
    return error.code === 'ESRCH' ? null : active;
  }
}

function resultQuality(quality) {
  if (typeof quality?.ok !== 'boolean' || !Array.isArray(quality.issues)) return undefined;
  return { passed: quality.ok, issues: quality.issues.length };
}

function databaseIdentity(databasePath) {
  return process.platform === 'win32' ? databasePath.toLowerCase() : databasePath;
}

function maintenanceError(error) {
  if (error instanceof FinanceError && /^(AUTH_|FUYAO_|UPSTREAM_|FINANCE_TIMEOUT)/.test(error.code)) return error;
  if (error?.code === 'FINANCE_CANCELLED') return dataError(error.code, '本次本地数据操作已取消。');
  if (['DATA_LOCKED', 'LOCAL_DATA_LOCKED', 'LOCAL_DB_LOCKED', 'FINANCE_WORKBENCH_BUSY'].includes(error?.code))
    return dataError('FINANCE_DATA_BUSY', '其他进程正在维护本地数据，请稍后重试。');
  return dataError('FINANCE_DATA_FAILED', '本地数据操作失败。请检查数据库、磁盘空间和账号权限后重试。');
}

export function createDataManagement({ cli, signal, userHome = homedir(), now = Date.now }) {
  const pending = new Set();
  const completed = new Map();
  let clockBusy = false;
  let lastTimerSlot;
  let home;

  function track(operation) {
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  }

  async function storage(create = false) {
    home ??= realpath(userHome);
    const root = await home;
    if (!create) return join(root, 'hithink-finance', '.dsh-data');
    return managedDirectory(await managedDirectory(root, 'hithink-finance'), '.dsh-data');
  }

  async function schedule() {
    const saved = await readJson(join(await storage(), scheduleFile), defaultSchedule);
    return typeof saved?.enabled === 'boolean' && validSyncTime(saved.time) ? saved : defaultSchedule;
  }

  async function database() {
    const reply = checkedEnvelope(await cli.run(['config', 'show'], { signal }), 'config.show');
    const configured = reply.data?.db_path;
    if (typeof configured !== 'string' || !isAbsolute(configured))
      throw dataError('FINANCE_DATA_PATH', '无法读取金融数据 CLI 的数据库路径。');
    const path = await realpath(configured).catch(async (error) => {
      if (error.code !== 'ENOENT') throw error;
      const parent = await realpath(dirname(configured)).catch(() => dirname(configured));
      return resolve(parent, basename(configured));
    });
    return path;
  }

  function statePath(root, databasePath) {
    return join(root, createHash('sha256').update(databaseIdentity(databasePath)).digest('hex') + '.json');
  }

  async function inspect(databasePath) {
    const info = await stat(databasePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!info) return { databaseState: 'uninitialized', latestDate: null };
    if (!info.isFile()) return { databaseState: 'unavailable', latestDate: null };
    async function query(sql) {
      const result = await cli.run(['--db', databasePath, 'db', 'query', '--sql', sql], { signal, timeoutMs: 12_000 });
      return checkedEnvelope(result, 'db.query').data?.[0];
    }
    try {
      const date = (await query('SELECT max(date)::VARCHAR AS latest_date FROM raw_kline_daily'))?.latest_date;
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
        return { databaseState: 'ready', latestDate: date };
      if (date === null) return { databaseState: 'uninitialized', latestDate: null };
    } catch (error) {
      if (signal.aborted) throw error;
      if (error?.code === 'DATA_LOCKED') return { databaseState: 'busy', latestDate: null };
      const table = await query("SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'main' AND table_name = 'raw_kline_daily'").catch(() => undefined);
      if (table?.count === 0 || table?.count === '0') return { databaseState: 'uninitialized', latestDate: null };
    }
    return { databaseState: 'unavailable', latestDate: null };
  }

  async function status() {
    const [databasePath, settings] = await Promise.all([database(), schedule()]);
    const filename = statePath(await storage(), databasePath);
    const state = await readJson(filename, {});
    const unsaved = completed.get(filename);
    const running = unsaved ? null : activeJob(state.active, now());
    const data = running ? (state.database ?? { databaseState: 'uninitialized', latestDate: null }) : await inspect(databasePath);
    return {
      databasePath, ...data, schedule: settings,
      running: running?.action ?? null, lastAction: state.lastAction ?? null,
      lastSync: state.lastSync ?? null, lastSuccessfulSync: state.lastSuccessfulSync ?? null,
      ...(unsaved && { statusWarning: '同步记录暂时无法写入。插件会自动重试。' }),
    };
  }

  async function configure(settings) {
    if (typeof settings?.enabled !== 'boolean' || !validSyncTime(settings.time))
      throw dataError('FINANCE_DATA_SCHEDULE', '请选择有效的北京时间。');
    const root = await storage(true);
    const updated = { enabled: settings.enabled, time: settings.time };
    await writeLocked(root, signal, () => writeAtomic(join(root, scheduleFile), JSON.stringify(updated),
      { signal, replace: true }));
    return updated;
  }

  async function runJob(filename, root, job, databasePath) {
    let receipt;
    try {
      const result = await cli.run(['--db', databasePath, 'data', job.action], {
        signal, timeoutMs: actionTimeout, maintenance: true,
      });
      const { data } = checkedEnvelope(result, 'data.' + job.action);
      const quality = resultQuality(job.action === 'validate' ? data : data?.quality);
      receipt = { ok: true, ...(quality && { quality }) };
    } catch (error) {
      receipt = { ok: false, error: publicError(maintenanceError(error)) };
    }
    const finished = { ...receipt, action: job.action, trigger: job.trigger, startedAt: job.startedAt, finishedAt: now() };
    completed.set(filename, { root, jobId: job.id, finished });
    await flushReceipt(filename).catch(() => {});
  }

  async function flushReceipt(filename) {
    const receipt = completed.get(filename);
    if (!receipt) return;
    const { root, jobId, finished } = receipt;
    await writeLocked(root, undefined, async () => {
      const state = await readJson(filename, {});
      if (state.active?.id !== jobId) return;
      delete state.active;
      state.lastAction = finished;
      if (finished.action === 'sync') {
        state.lastSync = finished;
        if (finished.ok && finished.quality?.passed !== false) state.lastSuccessfulSync = finished;
      }
      await writeAtomic(filename, JSON.stringify(state), { replace: true });
    });
    if (completed.get(filename) === receipt) completed.delete(filename);
  }

  async function startJob(action, slot, expectedDatabasePath) {
    if (!dataActions.includes(action)) throw dataError('FINANCE_DATA_ACTION', '本地数据操作无效。');
    const [databasePath, root] = await Promise.all([database(), storage(true)]);
    if (expectedDatabasePath !== undefined &&
        databaseIdentity(expectedDatabasePath) !== databaseIdentity(databasePath))
      throw dataError('FINANCE_DATA_PATH_CHANGED', 'CLI 数据库路径已切换。请核对当前数据库后重新操作。');
    const filename = statePath(root, databasePath);
    await flushReceipt(filename);
    const busy = () => dataError('FINANCE_DATA_BUSY', '正在维护本地数据，请稍后重试。');
    if (activeJob((await readJson(filename, {})).active, now())) {
      if (slot) return false;
      throw busy();
    }
    const data = await inspect(databasePath);
    const job = await writeLocked(root, signal, async () => {
      const state = await readJson(filename, {});
      if (slot) {
        const settings = await schedule();
        const alreadySynced = [state.lastSync?.startedAt, state.lastSync?.finishedAt].some((time) =>
          Number.isFinite(time) && dayFormat.format(time) + ' ' + timeFormat.format(time) === slot);
        if (state.scheduledSlot === slot || alreadySynced || !settings.enabled || settings.time !== slot.slice(-5))
          return null;
      }
      if (activeJob(state.active, now())) {
        if (slot) return null;
        throw busy();
      }
      const canRun = action === 'init' ? data.databaseState === 'uninitialized' : data.databaseState === 'ready';
      if (!canRun) {
        if (slot) return null;
        if (data.databaseState === 'busy') throw busy();
        throw dataError('FINANCE_DATA_UNAVAILABLE', data.databaseState === 'uninitialized'
          ? '请先初始化本地数据库。' : '当前数据库状态不支持此操作，请刷新后查看。');
      }
      const active = {
        id: randomUUID(), pid: process.pid, action, trigger: slot ? 'scheduled' : 'manual', startedAt: now(),
      };
      await writeAtomic(filename, JSON.stringify({ ...state, active, database: data,
        ...(slot && { scheduledSlot: slot }) }), { signal, replace: true });
      return active;
    });
    if (!job) return false;
    void track(runJob(filename, root, job, databasePath)).catch(() => {});
    return true;
  }

  async function runClock() {
    if (signal.aborted || clockBusy) return;
    const timestamp = now();
    const time = timeFormat.format(timestamp);
    const slot = dayFormat.format(timestamp) + ' ' + time;
    clockBusy = true;
    try {
      await Promise.allSettled([...completed.keys()].map(flushReceipt));
      if (slot === lastTimerSlot) return;
      const settings = await schedule();
      if (settings.enabled && settings.time === time && await startJob('sync', slot)) lastTimerSlot = slot;
    } finally {
      clockBusy = false;
    }
  }

  async function close() {
    while (pending.size > 0) await Promise.allSettled([...pending]);
    await Promise.allSettled([...completed.keys()].map(flushReceipt));
  }

  return {
    status, configure,
    start: (action, expectedDatabasePath) => track(startJob(action, undefined, expectedDatabasePath)),
    tick: () => track(runClock()), close,
  };
}
