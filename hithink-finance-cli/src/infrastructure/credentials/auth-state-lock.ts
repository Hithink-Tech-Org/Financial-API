import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertAuthRuntime, authError, type AuthPaths } from './auth-paths.js';
import {
  ensureAuthDirectory,
  privatePaths,
  fileCode,
  removeAbandonedAuthWrites,
} from './auth-files.js';

const queues = new Map<string, Promise<unknown>>();
export async function withAuthLock<T>(
  paths: AuthPaths,
  action: () => Promise<T>,
  budgetMs = 7000,
): Promise<T> {
  const previous = queues.get(paths.lock) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => lockedAction(paths, action, budgetMs));
  queues.set(paths.lock, next);
  try {
    return await next;
  } finally {
    if (queues.get(paths.lock) === next) queues.delete(paths.lock);
  }
}

async function lockedAction<T>(
  paths: AuthPaths,
  action: () => Promise<T>,
  budgetMs: number,
): Promise<T> {
  assertAuthRuntime();
  let exists = false;
  try {
    await lstat(paths.lock);
    exists = true;
  } catch (error) {
    if (fileCode(error) !== 'ENOENT') throw error;
  }
  if (exists) {
    // Validate the same directory chain and lock in one Windows ACL subprocess.
    await privatePaths([
      path.dirname(path.dirname(paths.root)),
      path.dirname(paths.root),
      paths.root,
      paths.lock,
    ]);
  } else {
    await ensureAuthDirectory(paths.root);
    try {
      const handle = await open(paths.lock, 'wx', 0o600);
      await handle.close();
      await privatePaths([paths.lock], process.platform !== 'win32');
    } catch (error) {
      if (fileCode(error) !== 'EEXIST') throw error;
    }
    await privatePaths([paths.lock]);
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(paths.lock);
  const deadline = Date.now() + budgetMs;
  let locked = false;
  try {
    db.exec('PRAGMA busy_timeout=0');
    for (;;) {
      try {
        db.exec('BEGIN IMMEDIATE');
        locked = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !/locked|busy/i.test(error.message)) throw error;
        if (Date.now() >= deadline)
          throw authError('AUTH_STORAGE_BUSY', 'Credential state is busy; retry shortly.', true);
        await delay(25);
      }
    }
    await removeAbandonedAuthWrites(paths.root);
    return await action();
  } finally {
    if (locked) db.exec('ROLLBACK');
    db.close();
  }
}
