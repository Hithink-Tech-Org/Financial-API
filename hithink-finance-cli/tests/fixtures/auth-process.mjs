import { randomBytes } from 'node:crypto';
import { authPaths } from '../../dist/infrastructure/credentials/auth-paths.js';
import { withAuthLock } from '../../dist/infrastructure/credentials/auth-state-lock.js';
import { GlobalCredentialStore } from '../../dist/infrastructure/credentials/global-store.js';
import { KeyringCredentialStore } from '../../dist/infrastructure/credentials/keyring.js';
const [command, home, namespace] = process.argv.slice(2);
if (!home || !namespace?.startsWith('hithink-finance-test-'))
  throw Error('isolated fixture required');
const paths = authPaths(() => home);
const keyring = new KeyringCredentialStore(namespace);
const store = new GlobalCredentialStore(paths, keyring);
if (command === 'hold') {
  await withAuthLock(paths, async () => {
    process.stdout.write('locked\n');
    await new Promise(() => {});
  });
} else if (command === 'increment') {
  await store.transaction(async (state) => {
    state.selection_epoch++;
  });
  process.stdout.write('committed\n');
} else if (command === 'file-write') {
  await store.transaction(async (state) => {
    state.credentials['api-key'] = await store.seal(state, 'api-key', {
      api_key: randomBytes(4000).toString('base64'),
    });
  });
  process.stdout.write('saved\n');
} else if (command === 'file-read') {
  const state = await store.read();
  const secret = await store.open(state, 'api-key');
  process.stdout.write(JSON.stringify({ recovered: secret.api_key.length > 4000 }) + '\n');
}
