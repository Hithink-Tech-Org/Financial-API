import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGlobalAuthProvider } from './auth-factory.js';
import { OAuthClient } from './oauth-client.js';
import { listenForCallback } from './loopback-callback.js';
import type { GlobalAuthProvider } from './global-provider.js';
import { authError } from './auth-paths.js';
import type { Language } from '../../cli/i18n.js';

export type AuthPhase = 'waiting' | 'exchanging' | 'validating' | 'saving';
export async function runAuthWorker(
  provider: GlobalAuthProvider,
  client: OAuthClient,
  intent: number,
  pendingId: string,
  ready: (url: string) => void,
  signal?: AbortSignal,
  options: { language?: Language; progress?: (phase: AuthPhase) => void } = {},
): Promise<void> {
  let callback: Awaited<ReturnType<typeof listenForCallback>> | undefined;
  let watcher: ReturnType<typeof setInterval> | undefined;
  let committed = false;
  let committing = false;
  const cancellation = new AbortController();
  const combinedSignal = signal
    ? AbortSignal.any([signal, cancellation.signal])
    : cancellation.signal;
  const stillPending = async () => {
    const state = await provider.store.read();
    return state?.login_intent_epoch === intent && (committing || state.pending?.id === pendingId);
  };
  try {
    const state = await provider.store.read();
    if (
      state?.pending?.id !== pendingId ||
      state.pending.intent !== intent ||
      state.pending.owner_pid !== process.pid ||
      state.login_intent_epoch !== intent
    )
      throw authError('AUTH_LOGIN_SUPERSEDED', 'The login attempt has ended.');
    const attempt = await client.authorize();
    callback = await listenForCallback(attempt.state, combinedSignal, options.language);
    let checking = false;
    watcher = setInterval(() => {
      if (checking) return;
      checking = true;
      void stillPending()
        .then(
          (valid) => {
            if (!valid) cancellation.abort();
          },
          () => cancellation.abort(),
        )
        .finally(() => {
          checking = false;
        });
    }, 500);
    ready(attempt.url);
    options.progress?.('waiting');
    const url = await callback.result;
    if (!(await stillPending()) || combinedSignal.aborted)
      throw authError('AUTH_LOGIN_SUPERSEDED', 'This login attempt was cancelled.');
    options.progress?.('exchanging');
    const tokens = await client.exchange(attempt, url);
    try {
      if (combinedSignal.aborted)
        throw authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.');
      committing = true;
      options.progress?.('validating');
      await provider.commitOAuth(intent, tokens, combinedSignal, () =>
        options.progress?.('saving'),
      );
      committed = true;
    } catch (error) {
      await client
        .revoke({
          access_token: tokens.access_token,
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        })
        .catch(() => undefined);
      throw error;
    }
    await callback.finish(true);
  } catch (error) {
    await callback?.finish(false);
    throw error;
  } finally {
    clearInterval(watcher);
    callback?.close();
    // Atomic commit already removed pending. A redundant write must not reverse success.
    if (!committed) await provider.clearPending(intent);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const abort = new AbortController();
  let started = false;
  const lifetime = setTimeout(() => {
    abort.abort();
    process.exitCode = 3;
  }, 300000);
  const send = (message: object) => {
    // The host may terminate the foreground process immediately after receiving the URL.
    if (process.connected) process.send?.(message, () => undefined);
  };
  process.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    if ('type' in message && message.type === 'cancel') {
      abort.abort();
      return;
    }
    if (started || !('id' in message) || typeof message.id !== 'string') return;
    started = true;
    void (async () => {
      const provider = createGlobalAuthProvider('https://fuyao.aicubes.cn');
      let intent: number | undefined;
      let workerOwnsCleanup = false;
      try {
        const client = new OAuthClient();
        intent = await provider.beginIntent(String(message.id));
        if (abort.signal.aborted)
          throw authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.');
        workerOwnsCleanup = true;
        await runAuthWorker(
          provider,
          client,
          intent,
          String(message.id),
          (url) => send({ type: 'ready', url }),
          abort.signal,
          {
            language: 'language' in message && message.language === 'en' ? 'en' : 'zh-CN',
            progress: (phase) => send({ type: 'progress', phase }),
          },
        );
        send({ type: 'complete' });
      } catch (error) {
        if (intent !== undefined && !workerOwnsCleanup)
          await provider.clearPending(intent).catch(() => undefined);
        send({
          type: 'failure',
          code: error instanceof Error && 'code' in error ? error.code : 'AUTH_LOGIN_FAILED',
        });
        process.exitCode = 3;
      } finally {
        clearTimeout(lifetime);
        if (process.connected) process.disconnect();
      }
    })();
  });
}
