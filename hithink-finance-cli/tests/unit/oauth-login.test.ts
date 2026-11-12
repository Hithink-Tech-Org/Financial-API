import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { startOAuthLogin } from '../../src/infrastructure/credentials/oauth-login.js';
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFile: vi.fn() }));
vi.mock('../../src/infrastructure/credentials/oauth-client.js', () => ({ OAuthClient: class {} }));

function worker() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null as number | null,
    signalCode: null,
    kill: vi.fn(),
    send: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
    unref: vi.fn(),
  });
  child.send.mockImplementation((message, callback) => {
    callback?.(null);
    if (message.type === 'cancel')
      queueMicrotask(() => {
        child.exitCode = 3;
        child.emit('exit', 3);
      });
    return true;
  });
  return child;
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
test.each(['timeout', 'cancel', 'failure'])(
  'late ready never emits a URL after %s',
  async (reason) => {
    vi.useFakeTimers();
    const child = worker();
    mocks.spawn.mockReturnValue(child);
    const output = vi.fn();
    const abort = new AbortController();
    const result = startOAuthLogin({
      background: true,
      noBrowser: true,
      signal: abort.signal,
      output,
    });
    const check = expect(result).rejects.toHaveProperty('code');
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(8000);
    else if (reason === 'cancel') abort.abort();
    else child.emit('message', { type: 'failure', code: 'AUTH_LOGIN_FAILED' });
    child.emit('message', { type: 'ready', url: 'https://auth.example.test/authorize' });
    await check;
    expect(output).not.toHaveBeenCalled();
    expect(child.send).toHaveBeenCalledWith({ type: 'cancel' }, expect.any(Function));
    expect(child.kill).not.toHaveBeenCalled();
  },
);

test('resource connectivity failure identifies the post-authorization stage', async () => {
  const child = worker();
  mocks.spawn.mockReturnValue(child);
  const execution = startOAuthLogin({ noBrowser: true, output: vi.fn() });
  const checked = expect(execution).rejects.toMatchObject({
    code: 'UPSTREAM_NETWORK_FAILURE',
    category: 'upstream',
    exitCode: 4,
    message: expect.stringContaining('data service'),
    hint: expect.stringContaining('connectivity'),
  });
  child.emit('message', { type: 'ready', url: 'https://auth.example.test/authorize' });
  child.emit('message', { type: 'failure', code: 'UPSTREAM_NETWORK_FAILURE' });
  await checked;
});

test.each(['AUTH_STORAGE_PERMISSIONS', 'AUTH_STORAGE_BUSY', 'AUTH_HOME_UNAVAILABLE'])(
  'background failure preserves the local storage classification: %s',
  async (code) => {
    const child = worker();
    mocks.spawn.mockReturnValue(child);
    const execution = startOAuthLogin({ background: true, noBrowser: true, output: vi.fn() });
    const checked = expect(execution).rejects.toMatchObject({
      code,
      category: 'local-data',
      exitCode: 5,
    });
    child.emit('message', { type: 'failure', code });
    await checked;
  },
);

test('foreground login prints the URL promptly but returns only after completion', async () => {
  const child = worker();
  mocks.spawn.mockReturnValue(child);
  const output = vi.fn();
  let finished = false;
  const execution = startOAuthLogin({ noBrowser: true, output }).then(() => {
    finished = true;
  });
  expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ background: false }));
  child.emit('message', { type: 'ready', url: 'https://auth.example.test/authorize' });
  await Promise.resolve();
  expect(output).toHaveBeenCalledOnce();
  expect(finished).toBe(false);
  child.emit('message', { type: 'complete' });
  await execution;
  expect(child.kill).not.toHaveBeenCalled();
});

test('background login permits intentional IPC detachment after ready', async () => {
  const child = worker();
  mocks.spawn.mockReturnValue(child);
  const execution = startOAuthLogin({ background: true, noBrowser: true, output: vi.fn() });
  expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ background: true }));
  child.emit('message', { type: 'ready', url: 'https://auth.example.test/authorize' });
  await execution;
  expect(child.disconnect).toHaveBeenCalledOnce();
  expect(child.kill).not.toHaveBeenCalled();
});

test('cancellation waits for cleanup and force-terminates an unresponsive worker within budget', async () => {
  vi.useFakeTimers();
  const child = worker();
  child.send.mockImplementation(() => true);
  mocks.spawn.mockReturnValue(child);
  const abort = new AbortController();
  const execution = startOAuthLogin({ signal: abort.signal, noBrowser: true, output: vi.fn() });
  const checked = expect(execution).rejects.toHaveProperty('code', 'AUTH_LOGIN_CANCELLED');
  child.emit('message', { type: 'ready', url: 'https://auth.example.test/authorize' });
  abort.abort();
  await vi.advanceTimersByTimeAsync(1499);
  expect(child.kill).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await checked;
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
});
