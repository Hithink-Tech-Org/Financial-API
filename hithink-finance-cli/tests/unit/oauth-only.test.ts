import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  OAuthClient,
  type OAuthProductConfig,
} from '../../src/infrastructure/credentials/oauth-client.js';

test.each([
  { userinfo: false, legacyGrant: false },
  { userinfo: true, legacyGrant: false },
  { userinfo: true, legacyGrant: true },
])(
  'OAuth-only grant: base_userinfo=$userinfo, legacy_data_scope=$legacyGrant',
  async ({ userinfo, legacyGrant }) => {
    const origin = 'https://issuer.example.test';
    const product: OAuthProductConfig = {
      environment: 'test',
      issuer: origin,
      discovery: origin + '/discovery',
      clientId: 'public-cli',
      resource: 'urn:finance',
      scopes: [...(userinfo ? ['base_userinfo'] : []), 'offline_access', 'fuyao:data.read'],
      endpointOrigins: [origin],
      apiOrigin: 'https://api.example.test',
      refreshRotation: 'required',
    };
    const requests: URLSearchParams[] = [];
    const client = new OAuthClient(product, async (input, init) => {
      if (String(input) === product.discovery)
        return Response.json({
          issuer: origin,
          authorization_endpoint: origin + '/authorize',
          token_endpoint: origin + '/token',
          revocation_endpoint: origin + '/revoke',
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        });
      requests.push(new URLSearchParams(String(init?.body)));
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      return Response.json({
        access_token: randomUUID(),
        refresh_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: legacyGrant
          ? 'base_userinfo offline_access mcp:data.read'
          : product.scopes.join(' '),
      });
    });
    const attempt = await client.authorize();
    const authorization = new URL(attempt.url);
    expect(authorization.searchParams.has('nonce')).toBe(false);
    expect(authorization.searchParams.get('scope')).toBe(product.scopes.join(' '));
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL('http://127.0.0.1:18765/oauth/callback');
    callback.searchParams.set('state', attempt.state);
    callback.searchParams.set('code', randomUUID());
    const exchange = client.exchange(attempt, callback);
    if (legacyGrant) {
      await expect(exchange).rejects.toMatchObject({ code: 'AUTH_OAUTH_PROTOCOL' });
      return;
    }
    const first = await exchange;
    expect(first.subject).toBeUndefined();
    expect(first.refresh_token).toBeTruthy();
    const renewed = await client.refresh(
      { refresh_token: first.refresh_token! },
      {
        session_id: randomUUID(),
        session_version: 1,
        known_state: 'available',
        secret: {},
        granted_scope: first.scope,
        binding: first.binding,
        has_refresh_token: true,
      },
    );
    expect(renewed.subject).toBeUndefined();
    expect(renewed.scope).toBe(first.scope);
    expect(renewed.refresh_token).not.toBe(first.refresh_token);
    expect(requests.map((r) => r.get('grant_type'))).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(
      requests.every(
        (r) => r.get('resource') === product.resource && r.get('client_id') === product.clientId,
      ),
    ).toBe(true);
  },
);
