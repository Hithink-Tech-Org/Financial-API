import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CredentialStore } from './keyring.js';
import { authError, type AuthPaths } from './auth-paths.js';
import { fileCode, privatePaths, writeAuthAtomic } from './auth-files.js';

export type AuthMethod = 'oauth' | 'api-key';
const credentialSchema = z
  .object({
    session_id: z.string().min(1),
    session_version: z.number().int().nonnegative(),
    known_state: z.enum(['available', 'invalid']),
    secret: z.record(z.string(), z.unknown()),
    expires_at: z.number().finite().optional(),
    refresh_expires_at: z.number().finite().optional(),
    has_refresh_token: z.boolean().optional(),
    binding: z.string().optional(),
    granted_scope: z.string().optional(),
    subject: z.string().optional(),
    last_verified_at: z.number().optional(),
    refresh_claim: z
      .object({
        operation_id: z.string(),
        session_version: z.number(),
        owner_pid: z.number(),
        owner_id: z.string(),
        started_at: z.number(),
        state: z.enum(['in_flight', 'uncertain']),
      })
      .optional(),
  })
  .strict();
export type StoredCredential = z.infer<typeof credentialSchema>;
const stateSchema = z
  .object({
    schema_version: z.literal(2),
    environment: z.enum(['production', 'test']),
    backend: z.literal('file'),
    initialized: z.literal(true),
    revision: z.number().int().nonnegative(),
    active_method: z.enum(['oauth', 'api-key']),
    selection_epoch: z.number().int().nonnegative(),
    login_intent_epoch: z.number().int().nonnegative(),
    credentials: z
      .object({
        oauth: credentialSchema.optional(),
        'api-key': credentialSchema.optional(),
      })
      .strict(),
    pending: z
      .object({
        id: z.string(),
        intent: z.number(),
        owner_pid: z.number(),
        expires_at: z.number(),
      })
      .optional(),
  })
  .strict();
export type AuthState = z.infer<typeof stateSchema>;

/** Shared user file; the legacy reader is used only to convert an old document. */
export class GlobalCredentialStore {
  constructor(
    private readonly location: AuthPaths | (() => AuthPaths),
    private readonly legacy: CredentialStore,
  ) {}
  get paths(): AuthPaths {
    return typeof this.location === 'function' ? this.location() : this.location;
  }
  async read(): Promise<AuthState | undefined> {
    return this.readState(false);
  }
  private async readState(migrate: boolean): Promise<AuthState | undefined> {
    let info;
    try {
      info = await lstat(this.paths.document);
    } catch (error) {
      if (fileCode(error) === 'ENOENT') return undefined;
      throw authError('AUTH_STORAGE_UNAVAILABLE', 'Cannot read credential state.', true);
    }
    await privatePaths([
      path.dirname(path.dirname(this.paths.root)),
      path.dirname(this.paths.root),
      this.paths.root,
      this.paths.document,
    ]);
    if (info.size > 1024 * 1024)
      throw authError('AUTH_STORAGE_CORRUPT', 'Credential state exceeds the allowed size.', true);
    let document: unknown;
    try {
      document = JSON.parse(await readFile(this.paths.document, 'utf8'));
    } catch (error) {
      if (['EACCES', 'EPERM'].includes(fileCode(error) ?? ''))
        throw authError(
          'AUTH_STORAGE_PERMISSIONS',
          'Credential storage cannot be read by the current user.',
          true,
        );
      throw authError('AUTH_STORAGE_CORRUPT', 'Cannot parse credential state.', true);
    }
    if (
      document &&
      typeof document === 'object' &&
      'schema_version' in document &&
      document.schema_version === 1
    ) {
      if (!migrate)
        throw authError(
          'AUTH_MIGRATION_REQUIRED',
          'Run `hithink-finance auth migrate` to import the previous credential format.',
          true,
        );
      await this.auditPermissions();
      const { convertLegacyDocument } = await import('./legacy-document.js');
      document = await convertLegacyDocument(document, this.legacy);
    }
    const parsed = stateSchema.safeParse(document);
    if (!parsed.success || parsed.data.environment !== this.paths.environment)
      throw authError(
        'AUTH_STORAGE_CORRUPT',
        'Credential state has an unsupported or damaged format.',
        true,
      );
    return parsed.data;
  }
  /** Full Windows DACL inspection is explicit, outside the ordinary request path. */
  async auditPermissions(): Promise<void> {
    await privatePaths(
      [
        path.dirname(path.dirname(this.paths.root)),
        path.dirname(this.paths.root),
        this.paths.root,
        this.paths.document,
        this.paths.lock,
      ],
      false,
      false,
      true,
    );
  }
  async transaction<T>(action: (state: AuthState, fresh: boolean) => Promise<T>): Promise<T> {
    const { withAuthLock } = await import('./auth-state-lock.js');
    return withAuthLock(this.paths, async () => {
      const saved = await this.readState(true);
      if (!saved) {
        // Existing empty directories may have inherited a broad Windows DACL.
        // Audit once before the first secret can be committed, even if no directory was created.
        await privatePaths(
          [
            path.dirname(path.dirname(this.paths.root)),
            path.dirname(this.paths.root),
            this.paths.root,
            this.paths.lock,
          ],
          false,
          false,
          true,
        );
      }
      const state: AuthState = saved ?? {
        schema_version: 2,
        environment: this.paths.environment,
        backend: 'file',
        initialized: true,
        revision: 0,
        active_method: 'oauth',
        selection_epoch: 0,
        login_intent_epoch: 0,
        credentials: {},
      };
      const result = await action(state, saved === undefined);
      state.revision++;
      stateSchema.parse(state);
      await writeAuthAtomic(this.paths.document, state);
      return result;
    });
  }
  async seal(
    _state: AuthState,
    _method: AuthMethod,
    secret: Record<string, string>,
    previous?: StoredCredential,
  ): Promise<StoredCredential> {
    const credential: StoredCredential = previous
      ? { ...previous, session_version: previous.session_version + 1 }
      : { session_id: randomUUID(), session_version: 1, known_state: 'available', secret: {} };
    credential.secret = z.record(z.string(), z.string()).parse(secret);
    return credential;
  }
  async open(state: AuthState, method: AuthMethod): Promise<Record<string, string> | undefined> {
    const credential = state.credentials[method];
    if (!credential) return undefined;
    const parsed = z.record(z.string(), z.string()).safeParse(credential.secret);
    if (!parsed.success)
      throw authError('AUTH_STORAGE_CORRUPT', 'Credential format is invalid.', true);
    return parsed.data;
  }
}
