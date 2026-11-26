import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { FinanceError } from './cli.js';
import { managedDirectory, readJson, writeAtomic } from './workbench-files.js';
import { writeLocked } from './workbench-lock.js';

const settingsFile = 'settings.json';
const maxSettingsBytes = 16 * 1024;
const noMigration = { copied: 0, skipped: 0, count: 0 };

function unavailable() {
  return new FinanceError('FINANCE_WORKBENCH_DIRECTORY_UNAVAILABLE', '看板目录不可用，请检查目录和写入权限，或在设置中选择其他目录。');
}

function confirmDirectory(expectedDirectory, directory) {
  if (expectedDirectory !== undefined && expectedDirectory !== directory) {
    throw new FinanceError('FINANCE_WORKBENCH_DIRECTORY_CHANGED', '看板目录已切换。请在设置中切回原目录，或从当前目录重新打开看板。');
  }
}

function absoluteDirectory(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\x00-\x1f\x7f]/.test(input) || !isAbsolute(input)) return false;
  if (sep !== '\\') return true;
  const { root } = parse(input);
  return root.length > 1 && !input.slice(root.length).includes(':') && !/^[/\\]{2}[?.][/\\]/.test(input);
}

async function directoryPath(directory, create) {
  try {
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
    const canonical = await realpath(directory);
    if (!(await lstat(canonical)).isDirectory()) throw unavailable();
    return canonical;
  } catch {
    throw unavailable();
  }
}

export function createStorageSettings(userHome) {
  async function configuration() {
    if (!absoluteDirectory(userHome)) throw unavailable();
    const home = await directoryPath(userHome, false);
    const base = await managedDirectory(home, 'hithink-finance');
    const defaultDirectory = join(base, 'dashboards');
    return { defaultDirectory, config: await managedDirectory(base, '.dsh-workbench') };
  }

  async function settings() {
    const state = await configuration();
    const filename = join(state.config, settingsFile);
    const info = await lstat(filename).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (info && (!info.isFile() || info.size > maxSettingsBytes || await realpath(filename) !== filename)) throw unavailable();
    const saved = info ? await readJson(filename, null) : null;
    const directory = saved?.directory ?? null;
    if (directory !== null && !absoluteDirectory(directory)) throw unavailable();
    return { ...state, directory: directory ?? state.defaultDirectory, custom: directory !== null };
  }

  async function get() {
    const { directory, defaultDirectory } = await settings();
    return { directory, defaultDirectory };
  }

  async function set(input, signal, migrate) {
    const requested = input?.directory;
    if (requested !== null && !absoluteDirectory(requested)) {
      throw new FinanceError('FINANCE_WORKBENCH_INVALID_DIRECTORY', '请输入本机看板目录的完整路径。');
    }
    if (input.migrateExisting !== undefined && typeof input.migrateExisting !== 'boolean') {
      throw new FinanceError('FINANCE_WORKBENCH_INVALID_MIGRATION', '请选择是否迁移现有看板。');
    }
    return write(signal, async () => {
      const state = await settings();
      const { config, defaultDirectory, directory: previousDirectory } = state;
      confirmDirectory(input.expectedDirectory, previousDirectory);
      const directory = await directoryPath(requested === null ? defaultDirectory : resolve(requested), true);
      if (requested === null && directory !== defaultDirectory) throw unavailable();
      const child = relative(config, directory);
      if (!child || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))) throw unavailable();
      const probe = join(directory, `.dsh-write-${randomUUID()}.tmp`);
      try {
        await writeAtomic(probe, '', { signal });
        await rm(probe);
      } catch {
        throw unavailable();
      }
      const counts = input.migrateExisting ? await migrate(await checkLocation(state), directory) : noMigration;
      if (directory !== previousDirectory) {
        try {
          await writeAtomic(join(config, settingsFile), JSON.stringify({ directory: directory === defaultDirectory ? null : directory }),
            { signal, replace: true });
        } catch {
          throw unavailable();
        }
      }
      return { directory, defaultDirectory, previousDirectory, ...counts };
    });
  }

  async function checkLocation({ config, directory, custom }) {
    if (await directoryPath(directory, !custom) !== directory) throw unavailable();
    return { config, directory };
  }

  async function location(expectedDirectory) {
    const state = await settings();
    confirmDirectory(expectedDirectory, state.directory);
    return checkLocation(state);
  }

  async function write(signal, run) {
    const { config } = await configuration();
    return writeLocked(config, signal, run);
  }

  return { get, set, location, write };
}
