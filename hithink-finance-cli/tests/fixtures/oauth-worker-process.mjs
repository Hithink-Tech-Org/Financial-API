import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { authPaths } from '../../dist/infrastructure/credentials/auth-paths.js';
import { GlobalCredentialStore } from '../../dist/infrastructure/credentials/global-store.js';
import { GlobalAuthProvider } from '../../dist/infrastructure/credentials/global-provider.js';
import { runAuthWorker } from '../../dist/infrastructure/credentials/auth-worker.js';
const [mode, home] = process.argv.slice(2);
if (!home) throw Error('isolated home required');
if (mode === 'parent') {
  const child = spawn(process.execPath, [process.argv[1], 'worker', home], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  child.on('message', (ready) =>
    process.stdout.write(JSON.stringify({ ...ready, pid: child.pid }) + '\n'),
  );
  setInterval(() => {}, 1000);
} else {
  const state = randomBytes(16).toString('hex');
  const keyring = {
    async get() {
      return undefined;
    },
    async set() {},
    async delete() {
      return false;
    },
    async listAccounts() {
      return [];
    },
  };
  const client = {
    binding: 'process-fixture',
    apiOrigin: 'https://api.example.test',
    async authorize() {
      return {
        state,
        nonce: randomUUID(),
        verifier: randomUUID(),
        url: `https://auth.example.test/authorize?state=${state}`,
      };
    },
    async exchange() {
      return {
        access_token: randomUUID(),
        refresh_token: randomUUID(),
        expires_at: Date.now() + 300000,
        scope: 'openid offline_access read',
        subject: 'test',
        binding: 'process-fixture',
      };
    },
    async revoke() {},
  };
  const provider = new GlobalAuthProvider(
    new GlobalCredentialStore(
      authPaths(() => home),
      keyring,
      'file',
    ),
    {
      legacy: keyring,
      env: {},
      validateKey: async () => undefined,
      validateOAuth: async () => undefined,
      oauth: client,
    },
  );
  const id = randomUUID();
  const intent = await provider.beginIntent(id);
  try {
    await runAuthWorker(provider, client, intent, id, (url) => process.send?.({ url }));
  } finally {
    if (process.connected) process.disconnect();
  }
}
