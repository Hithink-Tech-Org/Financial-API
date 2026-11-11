import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { runAuthWorker } from '../../src/infrastructure/credentials/auth-worker.js';
import type { GlobalAuthProvider } from '../../src/infrastructure/credentials/global-provider.js';
import type { OAuthClient } from '../../src/infrastructure/credentials/oauth-client.js';

const mocks = vi.hoisted(() => ({ listen: vi.fn(), finish: vi.fn(), close: vi.fn() }));
vi.mock('../../src/infrastructure/credentials/loopback-callback.js', () => ({
  listenForCallback: mocks.listen,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test.each([false, true])(
  'callback survives its own pending removal; external cancellation=%s',
  async (external) => {
    vi.useFakeTimers();
    const id = randomUUID();
    const state: {
      login_intent_epoch: number;
      pending?: { id: string; intent: number; owner_pid: number };
    } = {
      login_intent_epoch: 1,
      pending: { id, intent: 1, owner_pid: process.pid },
    };
    let observedSignal: AbortSignal | undefined;
    mocks.listen.mockImplementation(async (_expected: string, signal: AbortSignal) => {
      observedSignal = signal;
      signal.addEventListener('abort', () => mocks.finish(false));
      return {
        result: Promise.resolve(new URL('http://127.0.0.1:18765/oauth/callback?code=fixture')),
        finish: mocks.finish,
        close: mocks.close,
      };
    });
    const revoke = vi.fn(async () => undefined);
    const client = {
      authorize: async () => ({
        state: id,
        verifier: randomUUID(),
        url: 'https://issuer.example.test/authorize',
      }),
      exchange: async () => ({ access_token: randomUUID(), refresh_token: randomUUID() }),
      revoke,
    };
    const provider = {
      store: { read: async () => structuredClone(state) },
      commitOAuth: async (_intent: number, _tokens: unknown, signal: AbortSignal) => {
        if (external) state.login_intent_epoch++;
        delete state.pending;
        await vi.advanceTimersByTimeAsync(500);
        if (signal.aborted) throw Error('cancelled');
      },
      clearPending: vi.fn(async () => {
        if (!external) throw Error('a redundant post-commit write failed');
      }),
    };
    const execution = runAuthWorker(
      provider as unknown as GlobalAuthProvider,
      client as unknown as OAuthClient,
      1,
      id,
      () => undefined,
    );
    if (external) {
      await expect(execution).rejects.toThrow('cancelled');
      expect(observedSignal?.aborted).toBe(true);
      expect(mocks.finish).not.toHaveBeenCalledWith(true);
      expect(revoke).toHaveBeenCalledOnce();
    } else {
      await execution;
      expect(observedSignal?.aborted).toBe(false);
      expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(true);
      expect(revoke).not.toHaveBeenCalled();
      expect(provider.clearPending).not.toHaveBeenCalled();
    }
  },
);
