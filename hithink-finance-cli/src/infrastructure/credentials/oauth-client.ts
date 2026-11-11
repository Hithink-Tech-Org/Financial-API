import { createHash } from 'node:crypto';
import * as oidc from 'openid-client';
import { authError } from './auth-paths.js';
import type { OAuthTokens, OAuthTransport } from './global-provider.js';
import type { StoredCredential } from './global-store.js';

export const CALLBACK = 'http://127.0.0.1:18765/oauth/callback';
export interface OAuthProductConfig {
  environment: 'production' | 'test';
  issuer: string;
  discovery: string;
  clientId: string;
  resource: string;
  scopes: string[];
  endpointOrigins: string[];
  apiOrigin: string;
  refreshRotation: 'required' | 'reusable';
}
/** Populated only from the reviewed service delivery, never user input or inferred endpoints. */
export function deliveredOAuthConfig(): OAuthProductConfig | undefined {
  return {
    environment: 'production',
    issuer: 'https://upass.10jqka.com.cn/oidc/fuyao',
    discovery: 'https://upass.10jqka.com.cn/oidc/fuyao/.well-known/oauth-authorization-server',
    clientId: 'upoc_ozwzg0y_hithink_pub_prod',
    resource: 'https://fuyao.aicubes.cn',
    scopes: ['openid', 'base_userinfo', 'offline_access', 'fuyao:data.read'],
    endpointOrigins: ['https://upass.10jqka.com.cn'],
    apiOrigin: 'https://fuyao.aicubes.cn',
    refreshRotation: 'required',
  };
}
export interface AuthorizationAttempt {
  url: string;
  state: string;
  nonce?: string;
  verifier: string;
}

export class OAuthClient implements OAuthTransport {
  readonly binding: string;
  readonly apiOrigin: string;
  readonly product: OAuthProductConfig;
  private readonly useOidc: boolean;
  private configuration?: Promise<oidc.Configuration>;
  constructor(
    product = deliveredOAuthConfig(),
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {
    if (!product)
      throw authError(
        'AUTH_OAUTH_NOT_CONFIGURED',
        'OAuth service configuration is awaiting delivery. API key login is available.',
      );
    this.product = product;
    for (const value of [
      product.issuer,
      product.discovery,
      product.apiOrigin,
      ...product.endpointOrigins,
    ]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw authError('AUTH_OAUTH_CONFIGURATION', 'OAuth requires trusted HTTPS endpoints.');
    }
    if (!product.clientId || !product.resource || !product.scopes.includes('offline_access'))
      throw authError(
        'AUTH_OAUTH_CONFIGURATION',
        'OAuth resource and renewal configuration is incomplete.',
      );
    this.useOidc = product.scopes.includes('openid');
    this.apiOrigin = new URL(product.apiOrigin).origin;
    this.binding = createHash('sha256').update(JSON.stringify(product)).digest('hex');
  }

  private async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !this.product.endpointOrigins.includes(url.origin)
    )
      throw authError('AUTH_OAUTH_ENDPOINT', 'The authorization endpoint is not trusted.');
    const signal = init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(4000)])
      : AbortSignal.timeout(4000);
    const response = await this.fetchImplementation(url, { ...init, signal, redirect: 'error' });
    if (response.body === null) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 256 * 1024)
          throw authError(
            'AUTH_OAUTH_PROTOCOL',
            'Authorization response exceeds the allowed size.',
          );
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return new Response(Buffer.concat(chunks), {
      status: response.status,
      headers: response.headers,
    });
  }

  private config(): Promise<oidc.Configuration> {
    this.configuration ??= (async () => {
      // The delivery contains a complete endpoint, not an issuer for SDK URL inference.
      const response = await this.fetch(this.product.discovery, { method: 'GET' });
      if (
        response.status !== 200 ||
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json'
      )
        throw Error('Discovery response');
      const document: unknown = await response.json();
      if (!document || typeof document !== 'object' || Array.isArray(document))
        throw Error('Discovery metadata');
      const config = new oidc.Configuration(
        document as oidc.ServerMetadata,
        this.product.clientId,
        this.useOidc ? { id_token_signed_response_alg: 'ES256', [oidc.clockTolerance]: 30 } : {},
        oidc.None(),
      );
      config[oidc.customFetch] = (url, init) =>
        this.fetch(url, {
          method: init.method,
          headers: init.headers,
          ...(init.body === undefined ? {} : { body: init.body as BodyInit }),
          ...(init.signal === undefined ? {} : { signal: init.signal }),
        });
      config.timeout = 4;
      const metadata = config.serverMetadata();
      if (metadata.issuer !== this.product.issuer)
        throw authError(
          'AUTH_OAUTH_PROTOCOL',
          'The discovered issuer does not match the configured issuer.',
        );
      for (const endpoint of [
        metadata.authorization_endpoint,
        metadata.token_endpoint,
        metadata.revocation_endpoint,
        ...(this.useOidc ? [metadata.jwks_uri] : []),
      ]) {
        if (!endpoint)
          throw authError('AUTH_OAUTH_PROTOCOL', 'An authorization endpoint is missing.');
        const url = new URL(endpoint);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.hash ||
          !this.product.endpointOrigins.includes(url.origin)
        )
          throw authError('AUTH_OAUTH_ENDPOINT', 'Discovery returned an untrusted endpoint.');
      }
      if (
        !metadata.code_challenge_methods_supported?.includes('S256') ||
        (this.useOidc && !metadata.id_token_signing_alg_values_supported?.includes('ES256')) ||
        !metadata.token_endpoint_auth_methods_supported?.includes('none')
      )
        throw authError(
          'AUTH_OAUTH_PROTOCOL',
          'Discovery does not support the approved public client contract.',
        );
      if (this.useOidc) oidc.enableNonRepudiationChecks(config);
      return config;
    })();
    return this.configuration;
  }

  async authorize(): Promise<AuthorizationAttempt> {
    try {
      const config = await this.config();
      const verifier = oidc.randomPKCECodeVerifier(),
        state = oidc.randomState(),
        nonce = this.useOidc ? oidc.randomNonce() : undefined;
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: CALLBACK,
        response_type: 'code',
        scope: this.product.scopes.join(' '),
        resource: this.product.resource,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        ...(nonce ? { nonce } : {}),
      });
      return { url: url.href, state, ...(nonce ? { nonce } : {}), verifier };
    } catch {
      throw authError(
        'AUTH_OAUTH_PROTOCOL',
        'Authorization discovery or setup failed. Check the delivered configuration and connectivity.',
      );
    }
  }

  private async grantConfig(): Promise<oidc.Configuration> {
    // OIDC gets fresh JWKS per grant without replaying a code or RT; OAuth needs no identity token.
    const config = new oidc.Configuration(
      (await this.config()).serverMetadata(),
      this.product.clientId,
      this.useOidc ? { id_token_signed_response_alg: 'ES256', [oidc.clockTolerance]: 30 } : {},
      oidc.None(),
    );
    config[oidc.customFetch] = (url, init) =>
      this.fetch(url, {
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body as BodyInit }),
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      });
    config.timeout = 4;
    if (this.useOidc) oidc.enableNonRepudiationChecks(config);
    return config;
  }

  private tokens(
    response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers,
    previous?: StoredCredential,
    oldSecret?: Record<string, string>,
  ): OAuthTokens {
    const claims = this.useOidc ? response.claims() : undefined;
    const now = Date.now() / 1000;
    if (
      response.token_type.toLowerCase() !== 'bearer' ||
      (claims &&
        (!Number.isFinite(claims.iat) ||
          claims.iat > now + 30 ||
          !Number.isFinite(claims.exp) ||
          claims.exp <= claims.iat ||
          (claims.azp !== undefined && claims.azp !== this.product.clientId)))
    )
      throw Error('identity contract');
    if (
      (!previous && (!response.refresh_token || (this.useOidc && !claims))) ||
      (claims && (!claims.sub || (previous && claims.sub !== previous.subject)))
    )
      throw Error('identity');
    const subject = this.useOidc ? (claims?.sub ?? previous?.subject) : undefined;
    const scope = response.scope ?? previous?.granted_scope ?? this.product.scopes.join(' ');
    if (
      (this.useOidc && !subject) ||
      !scope ||
      !Number.isFinite(response.expires_in) ||
      response.expires_in! <= 0
    )
      throw Error('token contract');
    const granted = new Set(scope.split(' '));
    const prior = previous?.granted_scope?.split(' ');
    if (
      this.product.scopes.some((s) => !granted.has(s)) ||
      (prior && [...granted].some((s) => !prior.includes(s)))
    )
      throw Error('scope');
    const refresh =
      response.refresh_token ??
      (previous && this.product.refreshRotation === 'reusable'
        ? oldSecret?.refresh_token
        : undefined);
    if (!refresh) throw Error('refresh contract');
    return {
      access_token: response.access_token,
      refresh_token: refresh,
      expires_at: Date.now() + response.expires_in! * 1000,
      scope,
      ...(subject ? { subject } : {}),
      binding: this.binding,
    };
  }

  async exchange(attempt: AuthorizationAttempt, callback: URL): Promise<OAuthTokens> {
    try {
      if (this.useOidc && !attempt.nonce) throw Error('OIDC nonce missing');
      const result = await oidc.authorizationCodeGrant(
        await this.grantConfig(),
        callback,
        {
          expectedState: attempt.state,
          ...(this.useOidc ? { expectedNonce: attempt.nonce! } : {}),
          pkceCodeVerifier: attempt.verifier,
          idTokenExpected: this.useOidc,
        },
        { resource: this.product.resource },
      );
      return this.tokens(result);
    } catch {
      throw authError(
        'AUTH_OAUTH_PROTOCOL',
        'Authorization or identity verification failed. Start a new login.',
      );
    }
  }
  async refresh(
    secret: Record<string, string>,
    credential: StoredCredential,
  ): Promise<OAuthTokens> {
    try {
      const result = await oidc.refreshTokenGrant(await this.grantConfig(), secret.refresh_token!, {
        resource: this.product.resource,
      });
      return this.tokens(result, credential, secret);
    } catch (error) {
      if (error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant')
        throw authError(
          'AUTH_REFRESH_REJECTED',
          'The refresh token is no longer valid. Log in again.',
        );
      throw authError(
        'AUTH_REFRESH_UNCERTAIN',
        'Refresh did not complete reliably. The previous refresh token will not be sent again.',
      );
    }
  }
  async revoke(secret: Record<string, string>): Promise<void> {
    try {
      const config = await this.config();
      for (const [key, value] of Object.entries(secret))
        if (value && ['access_token', 'refresh_token'].includes(key))
          await oidc.tokenRevocation(config, value, { token_type_hint: key });
    } catch {
      throw authError(
        'AUTH_REVOCATION_INCOMPLETE',
        'Local logout completed; remote revocation could not be confirmed.',
      );
    }
  }
}
