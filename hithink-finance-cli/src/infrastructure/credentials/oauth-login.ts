import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OAuthClient } from './oauth-client.js';
import { authError } from './auth-paths.js';
import { CliError } from '../../contracts/errors.js';
import type { Language } from '../../cli/i18n.js';
import type { AuthPhase } from './auth-worker.js';

// Leave time for intent-scoped cleanup before the host's process-tree kill escalates.
const workerCleanupMs = 1500;
async function stopAuthWorker(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      child.removeListener('exit', done);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, workerCleanupMs);
    child.once('exit', done);
    if (child.connected) {
      child.send({ type: 'cancel' }, (error: Error | null) => {
        if (error) child.kill('SIGTERM');
      });
    } else child.kill('SIGTERM');
  });
}

export async function startOAuthLogin(options: {
  background?: boolean;
  noBrowser?: boolean;
  signal?: AbortSignal;
  output: (url: string) => void;
  language?: Language;
  progress?: (phase: AuthPhase) => void;
}): Promise<void> {
  new OAuthClient(); // Fail before creating state when the service configuration is unavailable.
  if (options.signal?.aborted)
    throw authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.');
  const startedAt = Date.now();
  const id = randomUUID();
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./auth-worker.js', import.meta.url))],
    {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  let ready = false;
  let terminal = false;
  let removeAbortListener: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          terminal = true;
          reject(
            authError(
              'AUTH_WORKER_TIMEOUT',
              'Authorization did not become ready within its startup budget.',
            ),
          );
        },
        Math.max(1, 8000 - (Date.now() - startedAt)),
      );
      const cancel = () => {
        terminal = true;
        clearTimeout(timeout);
        reject(authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.'));
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      removeAbortListener = () => options.signal?.removeEventListener('abort', cancel);
      child.once('error', () => {
        terminal = true;
        clearTimeout(timeout);
        reject(authError('AUTH_WORKER_FAILED', 'The authorization worker could not start.'));
      });
      child.once('exit', (code) => {
        terminal = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', cancel);
        if (!ready || !options.background) {
          if (code === 0 && ready) resolve();
          else reject(authError('AUTH_LOGIN_FAILED', 'Authorization did not complete.'));
        }
      });
      child.on(
        'message',
        (message: { type?: string; url?: string; code?: string; phase?: string }) => {
          if (terminal) return;
          if (message.type === 'ready' && message.url?.startsWith('https://')) {
            if (ready) return;
            if (Date.now() - startedAt >= 8000 || options.signal?.aborted) {
              cancel();
              return;
            }
            ready = true;
            clearTimeout(timeout);
            options.output(message.url);
            if (!options.noBrowser) {
              const command =
                process.platform === 'win32'
                  ? 'rundll32.exe'
                  : process.platform === 'darwin'
                    ? 'open'
                    : 'xdg-open';
              execFile(
                command,
                process.platform === 'win32'
                  ? ['url.dll,FileProtocolHandler', message.url]
                  : [message.url],
                { windowsHide: true },
                () => undefined,
              );
            }
            if (options.background) {
              terminal = true;
              options.signal?.removeEventListener('abort', cancel);
              child.disconnect();
              child.unref();
              resolve();
            }
          } else if (
            message.type === 'progress' &&
            ['waiting', 'exchanging', 'validating', 'saving'].includes(message.phase ?? '')
          ) {
            options.progress?.(message.phase as AuthPhase);
          } else if (message.type === 'failure') {
            terminal = true;
            clearTimeout(timeout);
            if (message.code === 'UPSTREAM_NETWORK_FAILURE') {
              reject(
                new CliError({
                  code: message.code,
                  category: 'upstream',
                  message:
                    'Browser authorization completed, but the data service could not be reached to validate the credential.',
                  hint: 'Check data service connectivity, then run `hithink-finance auth login` again.',
                  retryable: true,
                  exitCode: 4,
                }),
              );
              return;
            }
            const storage =
              message.code?.startsWith('AUTH_STORAGE_') === true ||
              message.code === 'AUTH_HOME_UNAVAILABLE' ||
              message.code === 'AUTH_MIGRATION_REQUIRED';
            reject(
              authError(
                message.code ?? 'AUTH_LOGIN_FAILED',
                storage
                  ? 'Credential storage could not be prepared.'
                  : 'Authorization failed. Start a new login.',
                storage,
              ),
            );
          } else if (message.type === 'complete') {
            terminal = true;
            clearTimeout(timeout);
            resolve();
          }
        },
      );
      child.send?.({
        id,
        language: options.language ?? 'zh-CN',
        background: options.background === true,
      });
    });
  } catch (error) {
    terminal = true;
    await stopAuthWorker(child);
    throw error;
  } finally {
    removeAbortListener?.();
  }
}
