import { randomUUID } from 'node:crypto';
import { authorizationUrl, checkedEnvelope, FinanceError, publicError } from './cli.js';

const credentialStates = new Set(['available', 'missing', 'invalid', 'login_required']);
const signedOut = { connected: false, method: null, credentials: { oauth: 'missing', apiKey: 'missing' } };

function reply(status, phase, fields) {
  return { ok: true, ...status, phase, ...fields };
}

async function readStatus(cli, signal) {
  const result = await cli.run(['auth', 'status'], { signal, timeoutMs: 12_000 });
  const { data } = checkedEnvelope(result, 'auth.status', [0, 3]);
  if (typeof data?.connected !== 'boolean' || data.connected !== (result.exitCode === 0)) {
    throw new FinanceError('FINANCE_INVALID_AUTH_STATUS', 'CLI 没有返回有效的账号状态。请刷新。');
  }
  const method = data.active_method;
  const credentialState = (name) => {
    const state = data.credentials?.[name]?.state;
    return credentialStates.has(state) ? state : (data.connected && method === name ? 'available' : 'missing');
  };
  return {
    connected: data.connected,
    method: method === 'oauth' || method === 'api-key' ? method : null,
    credentials: { oauth: credentialState('oauth'), apiKey: credentialState('api-key') },
  };
}

function failure(error, status = signedOut) {
  return { ...reply(status, 'error', { error: publicError(error) }), ok: false };
}

export function createAccount(cli, signal) {
  let attempt;
  let change;
  let revision = 0;
  let outcome;
  let snapshot = signedOut;

  async function status() {
    try {
      const checking = revision;
      const current = await readStatus(cli, signal);
      if (checking === revision && !change) snapshot = current;
      if (attempt) return reply(snapshot, 'pending');
      if (snapshot.connected) return reply(snapshot, 'connected');
      return outcome ? { ...outcome, ...snapshot } : reply(snapshot, 'idle');
    } catch (error) {
      return failure(error);
    }
  }

  async function finishLogin(active) {
    let final;
    try {
      snapshot = await readStatus(cli, active.signal);
      if (snapshot.connected && snapshot.method === 'oauth') {
        final = reply(snapshot, 'connected');
        return final;
      }
      const result = await cli.run(['auth', 'login', '--method', 'oauth', '--no-browser'], {
        signal: active.signal,
        timeoutMs: 330_000,
        onLine(line) {
          const url = authorizationUrl(line);
          if (!url || active.signal.aborted || attempt !== active) return;
          active.ready.resolve(reply(snapshot, 'pending', { attemptId: active.id, authorizationUrl: url }));
        },
      });
      const firstLine = result.stdout.indexOf('\n');
      const output = firstLine !== -1 && authorizationUrl(result.stdout.slice(0, firstLine).trim())
        ? result.stdout.slice(firstLine + 1)
        : result.stdout;
      checkedEnvelope({ ...result, stdout: output }, 'auth.login');
      snapshot = await readStatus(cli, active.signal);
      if (!snapshot.connected || snapshot.method !== 'oauth') {
        throw new FinanceError('AUTH_LOGIN_REQUIRED', '授权完成后仍未连接。请在账号页重新连接。');
      }
      final = reply(snapshot, 'connected');
    } catch (error) {
      final = active.signal.aborted ? reply(snapshot, 'cancelled') : failure(error, snapshot);
    } finally {
      if (attempt === active) {
        attempt = undefined;
        revision += 1;
        outcome = final;
      }
      active.ready.resolve(final);
    }
    return final;
  }

  function beginAttempt(peer, requesterId, streamSignal) {
    const controller = new AbortController();
    const active = {
      id: randomUUID(),
      peer,
      requesterId,
      ready: Promise.withResolvers(),
      controller,
      signal: AbortSignal.any([signal, controller.signal, streamSignal]),
    };
    outcome = undefined;
    attempt = active;
    revision += 1;
    active.done = finishLogin(active);
    return active;
  }

  async function* start(peer, requesterId, streamSignal) {
    if (!peer) {
      yield failure(new FinanceError('FINANCE_UI_REQUIRED', '请从插件账号页连接。'), snapshot);
      return;
    }
    if (attempt?.signal.aborted) await attempt.done;
    if (signal.aborted || streamSignal.aborted) return;
    if (change) {
      yield failure(new FinanceError('AUTH_CHANGE_PENDING', '已有账号操作正在进行。请稍后连接。'), snapshot);
      return;
    }
    if (attempt && (attempt.peer !== peer || attempt.requesterId !== requesterId)) {
      yield failure(new FinanceError('AUTH_LOGIN_BUSY', '已有授权正在进行。请回到发起授权的页面。'), snapshot);
      return;
    }
    const ownsAttempt = !attempt;
    const active = attempt ?? beginAttempt(peer, requesterId, streamSignal);
    try {
      const first = await active.ready.promise;
      if (streamSignal.aborted) return;
      yield first;
      if (first.phase === 'pending') {
        const final = await active.done;
        if (!streamSignal.aborted) yield final;
      }
    } finally {
      if (ownsAttempt && attempt === active) {
        active.controller.abort();
        await active.done;
      }
    }
  }

  async function cancel(peer, requesterId, attemptId) {
    const active = attempt;
    if (!peer || !active || active.id !== attemptId || active.peer !== peer || active.requesterId !== requesterId) {
      return failure(new FinanceError('AUTH_ATTEMPT_NOT_FOUND', '当前页面没有可取消的授权。请刷新账号状态。'), snapshot);
    }
    active.controller.abort();
    return active.done;
  }

  function changeCredential(peer, argv, operation, stdin) {
    if (!peer) return failure(new FinanceError('FINANCE_UI_REQUIRED', '请从插件账号页操作。'), snapshot);
    if (attempt || change) return failure(new FinanceError('AUTH_CHANGE_PENDING', '已有账号操作正在进行。请稍后重试。'), snapshot);
    revision += 1;
    outcome = undefined;
    change = (async () => {
      let problem;
      try {
        checkedEnvelope(await cli.run(argv, { signal, stdin }), operation);
      } catch (error) {
        // Preserve the public message only for operations that received a credential.
        problem = stdin === undefined ? error : safeKeyFailure(error, stdin);
      }
      try {
        snapshot = await readStatus(cli, signal);
        return problem ? failure(problem, snapshot) : reply(snapshot, snapshot.connected ? 'connected' : 'idle');
      } catch (error) {
        return failure(problem ?? (stdin === undefined ? error : safeKeyFailure(error, stdin)), snapshot);
      } finally {
        revision += 1;
        change = undefined;
      }
    })();
    return change;
  }

  function safeKeyFailure(error, submittedKey) {
    const { code, message } = publicError(error);
    if (code.includes(submittedKey) || message.includes(submittedKey)) {
      return new FinanceError('FINANCE_KEY_VERIFICATION_FAILED', 'API Key 验证未完成。请检查凭证后重试。');
    }
    return new FinanceError(code, message);
  }

  function loginApiKey(peer, value) {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!key || Buffer.byteLength(key, 'utf8') > 16 * 1024 || /[\u0000-\u001f\u007f]/.test(key)) {
      return failure(new FinanceError('FINANCE_INVALID_API_KEY_INPUT', '请输入单行 API Key。'), snapshot);
    }
    return changeCredential(peer, ['auth', 'login', '--method', 'api-key', '--api-key-stdin'], 'auth.login', key);
  }

  function selectMethod(peer, method) {
    if (method !== 'oauth' && method !== 'api-key') {
      return failure(new FinanceError('FINANCE_INVALID_AUTH_METHOD', '请选择账号授权或 API Key。'), snapshot);
    }
    return changeCredential(peer, ['auth', 'use', method], 'auth.use');
  }

  function signOut(peer, confirm) {
    if (!peer || confirm !== true) {
      return failure(new FinanceError('AUTH_CONFIRM_REQUIRED', '请在插件账号页确认退出共享的本机凭证。'), snapshot);
    }
    return changeCredential(peer, ['auth', 'logout'], 'auth.logout');
  }

  async function close() {
    const active = attempt;
    active?.controller.abort();
    await Promise.all([active?.done, change]);
  }

  return { status, start, cancel, loginApiKey, selectMethod, signOut, close };
}
