import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  OAuthClient,
  deliveredOAuthConfig,
  type OAuthProductConfig,
} from '../../src/infrastructure/credentials/oauth-client.js';

const product: OAuthProductConfig = {
  environment: 'test',
  issuer: 'https://issuer.example.test',
  discovery: 'https://issuer.example.test/.well-known/openid-configuration',
  clientId: 'test-public-client',
  resource: 'urn:test:read',
  scopes: ['openid', 'offline_access', 'read'],
  endpointOrigins: ['https://issuer.example.test'],
  apiOrigin: 'https://api.example.test',
  refreshRotation: 'required',
};
test('default OAuth uses the delivered production public client', async () => {
  const delivered = deliveredOAuthConfig();
  expect(delivered).toEqual({
    environment: 'production',
    issuer: 'https://upass.10jqka.com.cn/oidc/fuyao',
    discovery: 'https://upass.10jqka.com.cn/oidc/fuyao/.well-known/oauth-authorization-server',
    clientId: 'upoc_ozwzg0y_hithink_pub_prod',
    resource: 'https://fuyao.aicubes.cn',
    scopes: ['openid', 'base_userinfo', 'offline_access', 'fuyao:data.read'],
    endpointOrigins: ['https://upass.10jqka.com.cn'],
    apiOrigin: 'https://fuyao.aicubes.cn',
    refreshRotation: 'required',
  });
  const client = new OAuthClient(undefined, async (input) => {
    expect(String(input)).toBe(delivered!.discovery);
    return Response.json({
      issuer: delivered!.issuer,
      authorization_endpoint: delivered!.issuer + '/authorize',
      token_endpoint: delivered!.issuer + '/token',
      revocation_endpoint: delivered!.issuer + '/revoke',
      jwks_uri: delivered!.issuer + '/jwks',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      id_token_signing_alg_values_supported: ['ES256'],
    });
  });
  const attempt = await client.authorize();
  const url = new URL(attempt.url);
  expect(url.origin + url.pathname).toBe(delivered!.issuer + '/authorize');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: delivered!.clientId,
    redirect_uri: 'http://127.0.0.1:18765/oauth/callback',
    response_type: 'code',
    scope: delivered!.scopes.join(' '),
    resource: delivered!.resource,
    code_challenge_method: 'S256',
    state: attempt.state,
    nonce: attempt.nonce,
  });
  expect(url.searchParams.has('client_secret')).toBe(false);
});

test.each(['valid', 'wrong-issuer', 'redirect', 'non-object', 'wrong-media-type'])(
  'uses the exact delivered Discovery URL: %s',
  async (scenario) => {
    const discovery = product.issuer + '/fuyao/discovery';
    const requested: string[] = [];
    const client = new OAuthClient({ ...product, discovery }, async (input, options) => {
      requested.push(String(input));
      expect(options?.redirect).toBe('error');
      if (scenario === 'redirect')
        return new Response(null, { status: 302, headers: { location: product.discovery } });
      if (scenario === 'non-object') return Response.json([]);
      const metadata = {
        issuer: scenario === 'wrong-issuer' ? product.issuer + '/other' : product.issuer,
        authorization_endpoint: product.issuer + '/authorize',
        token_endpoint: product.issuer + '/token',
        jwks_uri: product.issuer + '/jwks',
        revocation_endpoint: product.issuer + '/revoke',
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      };
      return scenario === 'wrong-media-type'
        ? new Response(JSON.stringify(metadata), { headers: { 'content-type': 'text/html' } })
        : Response.json(metadata);
    });
    if (scenario === 'valid')
      expect((await client.authorize()).url.startsWith(product.issuer + '/authorize?')).toBe(true);
    else await expect(client.authorize()).rejects.toMatchObject({ code: 'AUTH_OAUTH_PROTOCOL' });
    expect(requested).toEqual([discovery]);
  },
);

test.each([
  'valid',
  'signature',
  'issuer',
  'audience',
  'nonce',
  'algorithm',
  'expired',
  'future-iat',
  'authorized-party',
  'token-type',
  'unknown-kid',
])('validates signed OIDC identity: %s', async (scenario) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'test-key',
    alg: 'ES256',
    use: 'sig',
  };
  let nonce = '';
  let tokenRequest: URLSearchParams | undefined;
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
    if (url.endsWith('/jwks')) return Response.json({ keys: [jwk] });
    tokenRequest = new URLSearchParams(String(options?.body));
    expect(new Headers(options?.headers).has('authorization')).toBe(false);
    const now = Math.floor(Date.now() / 1000);
    const parts = [
      Buffer.from(
        JSON.stringify({
          alg: scenario === 'algorithm' ? 'HS256' : 'ES256',
          kid: scenario === 'unknown-kid' ? 'missing-key' : 'test-key',
        }),
      ).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          iss: scenario === 'issuer' ? 'https://wrong.example.test' : product.issuer,
          aud: scenario === 'audience' ? 'other-client' : product.clientId,
          sub: 'test-subject',
          nonce: scenario === 'nonce' ? 'wrong' : nonce,
          iat: scenario === 'future-iat' ? now + 3600 : now,
          ...(scenario === 'authorized-party' ? { azp: 'other-client' } : {}),
          exp: scenario === 'expired' ? now - 300 : now + 300,
        }),
      ).toString('base64url'),
    ];
    const signature =
      scenario === 'signature'
        ? randomBytes(64)
        : sign('sha256', Buffer.from(parts.join('.')), {
            key: privateKey,
            dsaEncoding: 'ieee-p1363',
          });
    return Response.json({
      access_token: randomBytes(24).toString('hex'),
      refresh_token: randomBytes(24).toString('hex'),
      token_type: scenario === 'token-type' ? 'DPoP' : 'Bearer',
      expires_in: 300,
      scope: 'openid offline_access read',
      id_token: parts.join('.') + '.' + signature.toString('base64url'),
    });
  };
  const client = new OAuthClient(product, transport);
  const attempt = await client.authorize();
  const auth = new URL(attempt.url);
  nonce = auth.searchParams.get('nonce')!;
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  const callback = new URL('http://127.0.0.1:18765/oauth/callback');
  callback.searchParams.set('code', randomBytes(16).toString('hex'));
  callback.searchParams.set('state', auth.searchParams.get('state')!);
  const result = client.exchange(attempt, callback);
  if (scenario === 'valid') {
    expect(await result).toMatchObject({
      subject: 'test-subject',
      scope: 'openid offline_access read',
    });
    expect(tokenRequest!.get('client_id')).toBe(product.clientId);
    expect(tokenRequest!.has('client_secret')).toBe(false);
    expect(tokenRequest!.get('resource')).toBe(product.resource);
  } else await expect(result).rejects.toMatchObject({ code: 'AUTH_OAUTH_PROTOCOL' });
});
