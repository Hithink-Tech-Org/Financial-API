import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  OAuthClient,
  type OAuthProductConfig,
} from '../../src/infrastructure/credentials/oauth-client.js';

test.each([
  'rotated-kid',
  'no-id',
  'no-scope',
  'changed-sub',
  'missing-rotated-rt',
  'reusable-rt',
  'expanded-scope',
])('refresh response contract: %s', async (scenario) => {
  const product: OAuthProductConfig = {
    environment: 'test',
    issuer: 'https://issuer.example.test',
    discovery: 'https://issuer.example.test/.well-known/openid-configuration',
    clientId: 'fixture',
    resource: 'urn:fixture',
    scopes: ['openid', 'offline_access', 'read'],
    endpointOrigins: ['https://issuer.example.test'],
    apiOrigin: 'https://api.example.test',
    refreshRotation: scenario === 'reusable-rt' ? 'reusable' : 'required',
  };
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  let nonce = '',
    kid = 'first',
    grants = 0,
    jwks = 0;
  const transport: typeof fetch = async (input, options) => {
    const url = String(input);
    if (url.endsWith('openid-configuration'))
      return Response.json({
        issuer: product.issuer,
        authorization_endpoint: product.issuer + '/authorize',
        token_endpoint: product.issuer + '/token',
        jwks_uri: product.issuer + '/jwks',
        revocation_endpoint: product.issuer + '/revoke',
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    if (url.endsWith('/jwks')) {
      jwks++;
      return Response.json({
        keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }],
      });
    }
    grants++;
    const refresh = grants === 2;
    const body = new URLSearchParams(String(options?.body));
    expect(body.get('grant_type')).toBe(refresh ? 'refresh_token' : 'authorization_code');
    expect(new Headers(options?.headers).has('authorization')).toBe(false);
    if (refresh && scenario === 'rotated-kid') kid = 'second';
    const now = Math.floor(Date.now() / 1000);
    const signingInput = [
      Buffer.from(JSON.stringify({ alg: 'ES256', kid })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          iss: product.issuer,
          aud: product.clientId,
          sub: refresh && scenario === 'changed-sub' ? 'different-subject' : 'original-subject',
          iat: now,
          exp: now + 300,
          ...(!refresh ? { nonce } : {}),
        }),
      ).toString('base64url'),
    ].join('.');
    const idToken =
      signingInput +
      '.' +
      sign('sha256', Buffer.from(signingInput), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url');
    return Response.json({
      access_token: randomUUID(),
      token_type: 'Bearer',
      expires_in: 300,
      ...(!(refresh && ['missing-rotated-rt', 'reusable-rt'].includes(scenario))
        ? { refresh_token: randomUUID() }
        : {}),
      ...(!(refresh && scenario === 'no-id') ? { id_token: idToken } : {}),
      ...(!(refresh && scenario === 'no-scope')
        ? {
            scope:
              refresh && scenario === 'expanded-scope'
                ? 'openid offline_access read extra'
                : 'openid offline_access read',
          }
        : {}),
    });
  };
  const client = new OAuthClient(product, transport);
  const attempt = await client.authorize();
  nonce = attempt.nonce;
  const callback = new URL('http://127.0.0.1:18765/oauth/callback');
  callback.searchParams.set('state', attempt.state);
  callback.searchParams.set('code', randomUUID());
  const initial = await client.exchange(attempt, callback);
  const result = client.refresh(
    { access_token: initial.access_token, refresh_token: initial.refresh_token! },
    {
      session_id: randomUUID(),
      session_version: 1,
      known_state: 'available',
      secret: {},
      subject: initial.subject,
      granted_scope: initial.scope,
    },
  );
  if (['changed-sub', 'missing-rotated-rt', 'expanded-scope'].includes(scenario))
    await expect(result).rejects.toMatchObject({ code: 'AUTH_REFRESH_UNCERTAIN' });
  else {
    const renewed = await result;
    expect(renewed.subject).toBe(initial.subject);
    expect(renewed.scope).toBe(initial.scope);
    if (scenario === 'reusable-rt') expect(renewed.refresh_token).toBe(initial.refresh_token);
  }
  expect(grants).toBe(2);
  expect(jwks).toBe(scenario === 'no-id' ? 1 : 2);
});
