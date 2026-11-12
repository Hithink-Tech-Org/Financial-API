import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { startOAuthLogin } from '../../src/infrastructure/credentials/oauth-login.js';
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFile: vi.fn() }));
vi.mock('../../src/infrastructure/credentials/oauth-client.js', () => ({ OAuthClient: class {} }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
test.each(['timeout', 'cancel', 'failure'])(
  'late ready never emits a URL after %s',
  async (reason) => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      send: vi.fn(),
      connected: true,
      disconnect: vi.fn(),
      unref: vi.fn(),
    });
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
    expect(child.kill).toHaveBeenCalled();
  },
);

test('resource connectivity failure identifies the post-authorization stage', async () => {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    send: vi.fn(),
    connected: true,
  });
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
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      send: vi.fn(),
      connected: true,
    });
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
