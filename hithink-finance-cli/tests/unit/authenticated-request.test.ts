import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { authenticatedFetch } from '../../src/infrastructure/credentials/authenticated-request.js';
import type { AuthSession } from '../../src/application/ports/auth-provider.js';
const session = (): Extract<AuthSession, { method: 'oauth' }> => ({
  method: 'oauth',
  source: 'global',
  sessionId: 'test-session',
  apiOrigin: 'https://api.example.test',
  accessToken: vi.fn(async () => 'initial'),
  refresh: vi.fn(async () => 'renewed'),
});
test.each([2001, 2003, 5003])('resource code %s has bounded same-session refresh', async (code) => {
  const auth = session();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ code, message: 'test', data: null }))
    .mockResolvedValueOnce(Response.json({ code: 0, message: 'ok', data: [] }));
  const response = await authenticatedFetch(
    new URL('https://api.example.test/api/meta/tickers/list'),
    {},
    auth,
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledTimes(code === 2001 ? 2 : 1);
  expect(auth.refresh).toHaveBeenCalledTimes(code === 2001 ? 1 : 0);
  expect((await response.json()).code).toBe(code === 2001 ? 0 : code);
  for (const [, options] of fetcher.mock.calls) {
    expect(new Headers(options!.headers).has('x-api-key')).toBe(false);
    expect(new Headers(options!.headers).get('x-consumer-id')).toBe('cli-oauth');
    expect(options!.redirect).toBe('error');
  }
});

test.each(['oauth', 'api-key'] as const)(
  '%s requests use the consumer header for the selected authentication method',
  async (method) => {
    const apiKey = randomUUID();
    const auth: AuthSession =
      method === 'oauth'
        ? session()
        : { method: 'api-key', source: 'explicit', profile: 'default', apiKey };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 0 }));
    await authenticatedFetch(
      new URL('https://api.example.test/api/meta/tickers/list'),
      { headers: { 'X-Consumer-Id': 'qclaw', Accept: 'application/json' } },
      auth,
      fetcher,
    );
    const headers = new Headers(fetcher.mock.calls[0]![1]!.headers);
    expect(headers.get('x-consumer-id')).toBe(method === 'oauth' ? 'cli-oauth' : null);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.has('authorization')).toBe(method === 'oauth');
    expect(headers.get('x-api-key')).toBe(method === 'api-key' ? apiKey : null);
  },
);
test('OAuth destination validation happens before loading tokens', async () => {
  const auth = session();
  const fetcher = vi.fn<typeof fetch>();
  for (const value of [
    'https://evil.example.test/api/data',
    'http://api.example.test/api/data',
    'https://api.example.test/outside',
    'https://user@api.example.test/api/data',
  ])
    await expect(authenticatedFetch(new URL(value), {}, auth, fetcher)).rejects.toMatchObject({
      code: 'AUTH_UNTRUSTED_DESTINATION',
    });
  expect(auth.accessToken).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
