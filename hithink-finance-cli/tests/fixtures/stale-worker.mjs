import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { identity } from '../../dist/cli/worker/paths.js';
import { withAuthLock } from '../../dist/infrastructure/credentials/auth-state-lock.js';
import { writeAuthAtomic } from '../../dist/infrastructure/credentials/auth-files.js';
const paths = await identity(path.resolve(import.meta.dirname, '../..'));
await withAuthLock(paths, () =>
  writeAuthAtomic(paths.document, {
    pid: process.ppid,
    instance: randomBytes(16).toString('hex'),
    secret: randomBytes(32).toString('hex'),
    phase: 'ready',
    until: 0,
  }),
);
console.log(process.ppid);
