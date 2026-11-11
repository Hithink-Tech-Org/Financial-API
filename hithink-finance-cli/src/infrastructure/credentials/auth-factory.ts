import { z } from 'zod';
import { GlobalAuthProvider } from './global-provider.js';
import { GlobalCredentialStore } from './global-store.js';
import { KeyringCredentialStore } from './keyring.js';
import { authPaths, authError } from './auth-paths.js';
import { OAuthClient, deliveredOAuthConfig } from './oauth-client.js';
import { FuyaoClient } from '../fuyao/client.js';

export function createGlobalAuthProvider(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): GlobalAuthProvider {
  const legacy = new KeyringCredentialStore();
  const product = deliveredOAuthConfig();
  return new GlobalAuthProvider(
    new GlobalCredentialStore(
      () => authPaths(undefined, product?.environment ?? 'production'),
      new KeyringCredentialStore('hithink-finance-global'),
    ),
    {
      legacy,
      env,
      ...(product ? { oauth: new OAuthClient(product) } : {}),
      validateOAuth: async (tokens, signal) => {
        if (!product)
          throw authError(
            'AUTH_OAUTH_NOT_CONFIGURED',
            'OAuth service configuration is awaiting delivery.',
          );
        const client = new FuyaoClient({
          baseUrl: product.apiOrigin,
          auth: {
            method: 'oauth',
            source: 'global',
            sessionId: 'pending-login',
            apiOrigin: product.apiOrigin,
            accessToken: async () => tokens.access_token,
            refresh: async () => {
              throw authError(
                'AUTH_OAUTH_PROTOCOL',
                'A new authorization must pass resource validation.',
              );
            },
          },
          authRefreshBudget: { used: true },
          maxAttempts: 1,
          timeoutMs: 4000,
          ...(signal ? { signal } : {}),
        });
        await client.request({
          path: '/api/meta/tickers/list',
          query: { limit: 1 },
          schema: z.unknown(),
        });
      },
      validateKey: async (apiKey) => {
        const client = new FuyaoClient({
          baseUrl,
          auth: { method: 'api-key', apiKey, profile: 'default', source: 'explicit' },
          maxAttempts: 1,
          timeoutMs: 4000,
        });
        await client.request({
          path: '/api/meta/tickers/list',
          query: { limit: 1 },
          schema: z.unknown(),
        });
      },
    },
  );
}
