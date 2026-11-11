import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  ensureAuthDirectory,
  writeAuthAtomic,
} from '../../src/infrastructure/credentials/auth-files.js';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof fs>()),
  open: vi.fn((await original<typeof fs>()).open),
}));
test('failed flush preserves the prior document and removes the plaintext temporary file', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'finance-atomic-'));
  const paths = authPaths(() => home);
  try {
    await ensureAuthDirectory(paths.root);
    await writeAuthAtomic(paths.document, { revision: 1 });
    const real = await vi.importActual<typeof fs>('node:fs/promises');
    vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      const handle = await real.open(...args);
      handle.sync = async () => {
        throw Error('simulated flush failure');
      };
      return handle;
    });
    const canary = randomUUID();
    await expect(writeAuthAtomic(paths.document, { api_key: canary })).rejects.toThrow('simulated');
    expect(JSON.parse(await readFile(paths.document, 'utf8'))).toEqual({ revision: 1 });
    expect(await readdir(paths.root)).toEqual(['auth.json']);
  } finally {
    vi.mocked(fs.open).mockRestore();
    await rm(home, { recursive: true, force: true });
  }
}, 30000);
