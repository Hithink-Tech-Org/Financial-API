import { randomUUID } from 'node:crypto';
import type { AuthSession } from '../../application/ports/auth-provider.js';
import type { CredentialStore } from './keyring.js';
import {
  GlobalCredentialStore,
  type AuthMethod,
  type AuthState,
  type StoredCredential,
} from './global-store.js';
import { authError } from './auth-paths.js';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  refresh_expires_at?: number;
  scope: string;
  subject?: string;
  binding: string;
}
export interface OAuthTransport {
  readonly binding: string;
  readonly apiOrigin: string;
  refresh(secret: Record<string, string>, credential: StoredCredential): Promise<OAuthTokens>;
  revoke(secret: Record<string, string>): Promise<void>;
}
export interface GlobalProviderOptions {
  env?: NodeJS.ProcessEnv;
  legacy: CredentialStore;
  validateKey: (key: string) => Promise<void>;
  validateOAuth: (tokens: OAuthTokens, signal?: AbortSignal) => Promise<void>;
  oauth?: OAuthTransport;
}

export function oauthAvailable(c: StoredCredential | undefined, now = Date.now()): boolean {
  return (
    c?.known_state === 'available' &&
    ((c.expires_at ?? 0) > now ||
      (c.has_refresh_token === true &&
        !c.refresh_claim &&
        (c.refresh_expires_at ?? Infinity) > now))
  );
}

function ownerAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}

export class GlobalAuthProvider {
  readonly method = 'global';
  private readonly ownerId = randomUUID();
  constructor(
    readonly store: GlobalCredentialStore,
    private readonly options: GlobalProviderOptions,
  ) {}

  private checkProfile(profile: string): void {
    if (profile !== 'default')
      throw authError(
        'AUTH_MIGRATION_REQUIRED',
        'Select the legacy credential once with `auth migrate --legacy-profile <name>`, then remove the old profile setting.',
      );
  }

  private async initialize(profile: string, importLegacy = true): Promise<AuthState> {
    this.checkProfile(profile);
    let saved: AuthState | undefined;
    try {
      saved = await this.store.read();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'AUTH_MIGRATION_REQUIRED'
      )
        throw error;
    }
    if (saved) return saved;
    return this.store.transaction(async (state, fresh) => {
      await this.initializeState(state, fresh, importLegacy);
      return state;
    });
  }

  /** Import once inside the caller's state transaction, including a new OAuth login intent. */
  private async initializeState(
    state: AuthState,
    fresh: boolean,
    importLegacy = true,
  ): Promise<void> {
    if (!fresh) return;
    let accounts: string[];
    try {
      accounts = importLegacy
        ? (await this.options.legacy.listAccounts()).filter((k) => k.startsWith('profile:'))
        : [];
    } catch {
      throw authError(
        'AUTH_CREDENTIAL_STORE_UNAVAILABLE',
        'Cannot inspect legacy credentials.',
        true,
      );
    }
    const selected = accounts.includes('profile:default')
      ? 'profile:default'
      : accounts.length === 1
        ? accounts[0]
        : undefined;
    if (!selected && accounts.length > 1)
      throw authError(
        'AUTH_MIGRATION_REQUIRED',
        'Multiple legacy credentials exist. Run `auth migrate --legacy-profile <name>`.',
      );
    let key: string | undefined;
    if (selected) {
      try {
        key = await this.options.legacy.get(selected);
      } catch {
        throw authError(
          'AUTH_CREDENTIAL_STORE_UNAVAILABLE',
          'Cannot read the legacy credential.',
          true,
        );
      }
      if (!key)
        throw authError(
          'AUTH_STORAGE_CORRUPT',
          'The selected legacy credential is unavailable.',
          true,
        );
    } else key = (this.options.env ?? process.env).HITHINK_FINANCE_API_KEY;
    if (key?.trim()) {
      state.credentials['api-key'] = await this.store.seal(state, 'api-key', { api_key: key });
      state.active_method = 'api-key';
    }
  }

  async loginMethod(profile = 'default'): Promise<AuthMethod> {
    return (await this.initialize(profile, !this.options.oauth)).active_method;
  }

  async resolve(profile = 'default', explicit?: string): Promise<AuthSession> {
    if (explicit !== undefined) {
      if (!explicit.trim()) throw authError('AUTH_API_KEY_EMPTY', 'The API key cannot be empty.');
      return { method: 'api-key', profile: 'default', apiKey: explicit, source: 'explicit' };
    }
    const state = await this.initialize(profile);
    const method = state.active_method;
    const credential = state.credentials[method];
    if (!credential || credential.known_state === 'invalid')
      throw authError('AUTH_LOGIN_REQUIRED', 'Log in to the selected authentication method.');
    if (method === 'api-key') {
      const secret = await this.store.open(state, method);
      if (!secret?.api_key)
        throw authError('AUTH_STORAGE_CORRUPT', 'The saved API key is missing.', true);
      return { method, profile: 'default', apiKey: secret.api_key, source: state.backend };
    }
    const transport = this.options.oauth;
    if (!transport || credential.binding !== transport.binding)
      throw authError(
        'AUTH_OAUTH_NOT_CONFIGURED',
        'OAuth configuration has not been delivered for this installation.',
      );
    const sessionId = credential.session_id;
    let firstRequest = true;
    return {
      method: 'oauth',
      source: 'global',
      sessionId,
      apiOrigin: transport.apiOrigin,
      accessToken: async () => {
        if (firstRequest) {
          firstRequest = false;
          if ((credential.expires_at ?? 0) > Date.now()) {
            const secret = await this.store.open(state, 'oauth');
            if (secret?.access_token) return secret.access_token;
          }
        }
        return this.token(sessionId);
      },
      refresh: (rejected: string) => this.token(sessionId, rejected),
    };
  }

  private oauthUsable(credential: StoredCredential | undefined): boolean {
    return (
      oauthAvailable(credential) &&
      (!this.options.oauth || credential?.binding === this.options.oauth.binding)
    );
  }

  async status() {
    const state = await this.store.read();
    const method = state?.active_method ?? 'oauth';
    const credential = state?.credentials[method];
    // Read/decrypt only; do not probe, initialize, refresh or repair on status.
    if (credential && state) await this.store.open(state, method);
    const connected =
      method === 'oauth' ? this.oauthUsable(credential) : credential?.known_state === 'available';
    return {
      connected,
      active_method: method,
      credentials: Object.fromEntries(
        (['oauth', 'api-key'] as const).map((m) => {
          const c = state?.credentials[m];
          return [
            m,
            {
              state: !c
                ? 'missing'
                : c.known_state === 'invalid'
                  ? 'invalid'
                  : m === 'oauth' && !this.oauthUsable(c)
                    ? 'login_required'
                    : 'available',
              ...(c?.last_verified_at === undefined
                ? {}
                : { last_verified_at: c.last_verified_at }),
              ...(c?.refresh_claim ? { refresh_state: c.refresh_claim.state } : {}),
            },
          ];
        }),
      ),
      pending:
        state?.pending &&
        state.pending.expires_at > Date.now() &&
        ownerAlive(state.pending.owner_pid)
          ? { expires_at: state.pending.expires_at }
          : null,
      storage: {
        backend: state?.backend ?? null,
        available: true,
        path: this.store.paths.document,
        encrypted: false,
        cleanup_pending: false,
      },
    };
  }

  async login(input: {
    profile?: string;
    apiKey: string;
  }): Promise<Awaited<ReturnType<GlobalAuthProvider['status']>>> {
    this.checkProfile(input.profile ?? 'default');
    if (!input.apiKey.trim()) throw authError('AUTH_API_KEY_EMPTY', 'The API key cannot be empty.');
    const intent = await this.beginIntent();
    await this.options.validateKey(input.apiKey);
    await this.store.transaction(async (state) => {
      this.checkIntent(state, intent);
      state.credentials['api-key'] = await this.store.seal(state, 'api-key', {
        api_key: input.apiKey,
      });
      state.credentials['api-key'].last_verified_at = Date.now();
      state.active_method = 'api-key';
      state.selection_epoch++;
      delete state.pending;
    });
    return this.status();
  }

  async migrate(profile?: string): Promise<void> {
    if (profile === undefined) {
      await this.initialize('default');
      return;
    }
    const key = await this.options.legacy.get(`profile:${profile}`);
    if (!key) throw authError('AUTH_LEGACY_MISSING', 'The selected legacy API key does not exist.');
    await this.login({ apiKey: key });
  }

  async use(method: AuthMethod): Promise<void> {
    await this.store.transaction(async (state) => {
      const c = state.credentials[method];
      if (!c || c.known_state === 'invalid' || (method === 'oauth' && !this.oauthUsable(c)))
        throw authError(
          'AUTH_LOGIN_REQUIRED',
          'Log in before selecting this authentication method.',
        );
      await this.store.open(state, method);
      state.active_method = method;
      state.selection_epoch++;
      state.login_intent_epoch++;
      delete state.pending;
    });
  }

  async beginIntent(pendingId?: string): Promise<number> {
    return this.store.transaction(async (state, fresh) => {
      if (pendingId) await this.initializeState(state, fresh, false);
      if (
        pendingId &&
        state.pending &&
        state.pending.expires_at > Date.now() &&
        ownerAlive(state.pending.owner_pid)
      )
        throw authError(
          'AUTH_IN_PROGRESS',
          'An authorization is already pending. Finish it or log out first.',
        );
      state.login_intent_epoch++;
      delete state.pending;
      if (pendingId)
        state.pending = {
          id: pendingId,
          intent: state.login_intent_epoch,
          owner_pid: process.pid,
          expires_at: Date.now() + 300000,
        };
      return state.login_intent_epoch;
    });
  }
  private checkIntent(state: AuthState, intent: number): void {
    if (state.login_intent_epoch !== intent)
      throw authError(
        'AUTH_LOGIN_SUPERSEDED',
        'A newer authentication action superseded this login.',
      );
  }
  async commitOAuth(
    intent: number,
    tokens: OAuthTokens,
    signal?: AbortSignal,
    verified?: () => void,
  ): Promise<void> {
    if (signal?.aborted) throw authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.');
    await this.options.validateOAuth(tokens, signal);
    verified?.();
    await this.store.transaction(async (state) => {
      if (signal?.aborted) throw authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled.');
      this.checkIntent(state, intent);
      state.credentials.oauth = await this.sealOAuth(state, tokens);
      state.active_method = 'oauth';
      state.selection_epoch++;
      delete state.pending;
    });
  }
  private async sealOAuth(
    state: AuthState,
    tokens: OAuthTokens,
    previous?: StoredCredential,
  ): Promise<StoredCredential> {
    const c = await this.store.seal(
      state,
      'oauth',
      {
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      },
      previous,
    );
    c.expires_at = tokens.expires_at;
    c.has_refresh_token = !!tokens.refresh_token;
    c.subject = tokens.subject;
    c.binding = tokens.binding;
    c.granted_scope = tokens.scope;
    c.last_verified_at = Date.now();
    c.known_state = 'available';
    if (tokens.refresh_expires_at !== undefined) c.refresh_expires_at = tokens.refresh_expires_at;
    delete c.refresh_claim;
    return c;
  }
  async clearPending(intent: number): Promise<void> {
    await this.store.transaction(async (state) => {
      if (state.pending?.intent === intent) delete state.pending;
    });
  }

  async logout(all = false): Promise<void> {
    let tokens: Record<string, string> | undefined;
    let revocationUnavailable = false;
    await this.store.transaction(async (state) => {
      const method = state.active_method;
      if (all || method === 'oauth') {
        try {
          tokens = await this.store.open(state, 'oauth');
        } catch {
          revocationUnavailable = true;
        }
        delete state.credentials.oauth;
      }
      if (all || method === 'api-key') delete state.credentials['api-key'];
      state.selection_epoch++;
      state.login_intent_epoch++;
      delete state.pending;
    });
    if (revocationUnavailable || (tokens && !this.options.oauth))
      throw authError(
        'AUTH_REVOCATION_INCOMPLETE',
        'Local logout completed; remote revocation could not be confirmed.',
      );
    if (tokens && this.options.oauth) await this.options.oauth.revoke(tokens);
  }
  async logoutAll(): Promise<void> {
    await this.logout(true);
  }
  async purge(): Promise<void> {
    await this.logoutAll();
  }

  private async token(sessionId: string, rejected?: string): Promise<string> {
    const snapshot = await this.store.read();
    const current = snapshot?.credentials.oauth;
    if (
      !snapshot ||
      !current ||
      current.session_id !== sessionId ||
      current.known_state !== 'available'
    )
      throw authError('AUTH_LOGIN_REQUIRED', 'This OAuth session has ended.');
    if ((current.expires_at ?? 0) > Date.now()) {
      const secret = await this.store.open(snapshot, 'oauth');
      if (secret?.access_token && secret.access_token !== rejected) return secret.access_token;
    }
    let secret: Record<string, string> | undefined;
    let selected: StoredCredential | undefined;
    let result: string | undefined;
    const operation = randomUUID();
    await this.store.transaction(async (state) => {
      const c = state.credentials.oauth;
      if (!c || c.session_id !== sessionId || c.known_state !== 'available')
        throw authError('AUTH_LOGIN_REQUIRED', 'This OAuth session has ended.');
      secret = await this.store.open(state, 'oauth');
      if ((c.expires_at ?? 0) > Date.now() && secret?.access_token !== rejected) {
        result = secret?.access_token;
        return;
      }
      if (c.refresh_claim)
        throw authError(
          c.refresh_claim.state === 'uncertain' || Date.now() - c.refresh_claim.started_at > 30000
            ? 'AUTH_REFRESH_UNCERTAIN'
            : 'AUTH_REFRESH_IN_PROGRESS',
          'A refresh is pending or its outcome is unknown. Do not reuse the previous refresh token.',
        );
      if (!secret?.refresh_token || (c.refresh_expires_at ?? Infinity) <= Date.now())
        throw authError('AUTH_LOGIN_REQUIRED', 'The OAuth session needs a new login.');
      selected = { ...c };
      c.refresh_claim = {
        operation_id: operation,
        session_version: c.session_version,
        owner_pid: process.pid,
        owner_id: this.ownerId,
        started_at: Date.now(),
        state: 'in_flight',
      };
    });
    if (result) return result;
    try {
      const tokens = await this.options.oauth!.refresh(secret!, selected!);
      await this.store.transaction(async (state) => {
        const c = state.credentials.oauth;
        if (c?.session_id !== sessionId || c.refresh_claim?.operation_id !== operation)
          throw authError('AUTH_LOGIN_SUPERSEDED', 'The session ended during refresh.');
        state.credentials.oauth = await this.sealOAuth(state, tokens, c);
      });
      return tokens.access_token;
    } catch (error) {
      await this.store.transaction(async (state) => {
        const c = state.credentials.oauth;
        if (c?.session_id === sessionId && c.refresh_claim?.operation_id === operation) {
          c.refresh_claim.state = 'uncertain';
          if (error instanceof Error && 'code' in error && error.code === 'AUTH_REFRESH_REJECTED')
            c.known_state = 'invalid';
        }
      });
      throw error;
    }
  }
}
