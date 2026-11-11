import { createDecipheriv } from 'node:crypto';
import { z } from 'zod';
import type { CredentialStore } from './keyring.js';
import { authError } from './auth-paths.js';
import { fileCode } from './auth-files.js';
import { CliError } from '../../contracts/errors.js';

const legacySchema = z
  .object({
    schema_version: z.literal(1),
    environment: z.enum(['production', 'test']),
    backend: z.enum(['keyring', 'file']),
    key_id: z.string().min(1),
    credentials: z.record(
      z.string(),
      z
        .object({
          session_id: z.string(),
          secret: z.record(z.string(), z.unknown()),
          refresh_claim: z
            .object({ state: z.string(), owner_pid: z.number(), started_at: z.number() })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
    pending: z.object({ owner_pid: z.number(), expires_at: z.number() }).passthrough().optional(),
    purge_pending: z.boolean().optional(),
  })
  .passthrough();

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return fileCode(error) !== 'ESRCH';
  }
}

/** Called under the fixed state lock. Never resumes a v1 worker or replays its RT. */
export async function convertLegacyDocument(
  input: unknown,
  keyring: CredentialStore,
): Promise<unknown> {
  const parsed = legacySchema.safeParse(input);
  if (!parsed.success)
    throw authError('AUTH_STORAGE_CORRUPT', 'The previous credential file is damaged.', true);
  const old = parsed.data;
  if (
    old.purge_pending ||
    (old.pending && old.pending.expires_at > Date.now() && alive(old.pending.owner_pid)) ||
    Object.values(old.credentials).some((credential) => {
      const claim = credential.refresh_claim;
      return (
        claim?.state === 'in_flight' &&
        alive(claim.owner_pid) &&
        Date.now() - claim.started_at <= 30000
      );
    })
  )
    throw authError(
      'AUTH_STORAGE_BUSY',
      'Finish the previous login, refresh or purge before migrating.',
      true,
    );
  let root: Buffer | undefined;
  try {
    if (old.backend === 'keyring' && Object.keys(old.credentials).length) {
      let encoded: string | undefined;
      try {
        encoded = await keyring.get('global-root:' + old.key_id);
      } catch {
        throw authError(
          'AUTH_CREDENTIAL_STORE_UNAVAILABLE',
          'Cannot read the previous encryption key.',
          true,
        );
      }
      if (!encoded)
        throw authError(
          'AUTH_ROOT_MISSING',
          'The previous encryption key is unavailable. Restore it before migrating.',
          true,
        );
      root = Buffer.from(encoded, 'base64');
      if (root.length !== 32) throw Error('root format');
    }
    const credentials: Record<string, unknown> = {};
    for (const [method, credential] of Object.entries(old.credentials)) {
      if (credential.refresh_claim?.state === 'in_flight') {
        // A lost/stale operation is preserved as uncertain, never resumed with its old RT.
        credential.refresh_claim = { ...credential.refresh_claim, state: 'uncertain' };
      }
      let secret: unknown = credential.secret;
      if (old.backend === 'keyring') {
        const encrypted = z
          .object({ nonce: z.string(), tag: z.string(), ciphertext: z.string() })
          .strict()
          .parse(secret);
        const nonce = Buffer.from(encrypted.nonce, 'base64');
        const tag = Buffer.from(encrypted.tag, 'base64');
        if (nonce.length !== 12 || tag.length !== 16) throw Error('cipher format');
        const decipher = createDecipheriv('aes-256-gcm', root!, nonce);
        decipher.setAAD(
          Buffer.from(
            JSON.stringify([
              1,
              old.backend,
              old.environment,
              old.key_id,
              method,
              credential.session_id,
            ]),
          ),
        );
        decipher.setAuthTag(tag);
        secret = JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
            decipher.final(),
          ]).toString('utf8'),
        );
      }
      credentials[method] = {
        ...credential,
        secret: z.record(z.string(), z.string()).parse(secret),
      };
    }
    const result = { ...old, schema_version: 2, backend: 'file', credentials } as Record<
      string,
      unknown
    >;
    for (const key of ['key_id', 'purged', 'purge_pending', 'retired_key_ids', 'pending'])
      delete result[key];
    if (old.pending && typeof result.login_intent_epoch === 'number') result.login_intent_epoch++;
    return JSON.parse(JSON.stringify(result));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw authError(
      'AUTH_STORAGE_CORRUPT',
      'The previous credential could not be decoded; the original file was preserved.',
      true,
    );
  } finally {
    root?.fill(0);
  }
}
