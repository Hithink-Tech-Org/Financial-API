import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(await readFile(pidFile, 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 0) return pid;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await delay(20);
  }
  throw Error('Timed out waiting for the blocking child process.');
}

export function stoppedState(state: string): boolean {
  if (!/^[A-Za-z]/u.test(state.trim())) throw Error('Missing process state.');
  return /^[ZX]/u.test(state.trim());
}

async function processHasStopped(pid: number): Promise<boolean> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Expected a positive process ID.');
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
    throw error;
  }
  if (process.platform === 'linux') {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const end = stat.lastIndexOf(')');
      if (end < 0) throw Error('Invalid process stat.');
      return stoppedState(stat.slice(end + 2, end + 3));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
  }
  if (process.platform === 'darwin') {
    try {
      const result = await run('ps', ['-o', 'stat=', '-p', String(pid)], { timeout: 1000 });
      return stoppedState(result.stdout);
    } catch (error) {
      const failure = error as { code?: unknown; stdout?: unknown };
      if (failure.code === 1 && !String(failure.stdout ?? '').trim()) return true;
      throw error;
    }
  }
  return false;
}

export async function waitForProcessToStop(pid: number, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await processHasStopped(pid)) return true;
    await delay(20);
  } while (Date.now() < deadline);
  return processHasStopped(pid);
}
