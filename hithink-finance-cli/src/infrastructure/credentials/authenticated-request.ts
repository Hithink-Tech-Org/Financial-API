import type { AuthSession } from '../../application/ports/auth-provider.js';
import { authError } from './auth-paths.js';

/** Each invocation gets one refresh budget, separate from transport retries. */
export async function authenticatedFetch(
  url: URL,
  init: RequestInit,
  auth: AuthSession,
  fetcher: typeof fetch = globalThis.fetch,
  refreshBudget = { used: false },
): Promise<Response> {
  if (
    auth.method === 'oauth' &&
    (url.protocol !== 'https:' ||
      url.origin !== auth.apiOrigin ||
      !url.pathname.startsWith('/api/') ||
      url.username ||
      url.password)
  )
    throw authError(
      'AUTH_UNTRUSTED_DESTINATION',
      'OAuth credentials can only be sent to the configured API.',
    );
  const headers = new Headers(init.headers);
  headers.delete('authorization');
  headers.delete('x-api-key');
  headers.delete('x-consumer-id');
  if (auth.method === 'oauth') headers.set('X-Consumer-Id', 'cli-oauth');
  const token = auth.method === 'oauth' ? await auth.accessToken() : auth.apiKey;
  headers.set(
    auth.method === 'oauth' ? 'authorization' : 'X-api-key',
    auth.method === 'oauth' ? `Bearer ${token}` : token,
  );
  const response = await fetcher(url, { ...init, headers, redirect: 'error' });
  if (
    auth.method !== 'oauth' ||
    refreshBudget.used ||
    !response.ok ||
    (init.method !== undefined && init.method !== 'GET')
  )
    return response;
  let code: unknown;
  try {
    code = ((await response.clone().json()) as { code?: unknown }).code;
  } catch {
    return response;
  }
  if (code !== 2001) return response;
  refreshBudget.used = true;
  const refreshed = await auth.refresh(token);
  headers.set('authorization', `Bearer ${refreshed}`);
  await response.body?.cancel();
  return fetcher(url, { ...init, headers, redirect: 'error' });
}
