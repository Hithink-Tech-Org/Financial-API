// Child-process test adapter. Never shipped; production paths remain OS-owned.
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = os.userInfo;
const supplied = process.env.HITHINK_TEST_USER_HOME;
const home = supplied ?? mkdtempSync(path.join(os.tmpdir(), 'finance-test-user-'));
os.userInfo = (...args) => ({ ...original(...args), homedir: home });
syncBuiltinESMExports();
const { KeyringCredentialStore } = await import('../../dist/infrastructure/credentials/keyring.js');
KeyringCredentialStore.prototype.supportsPersistentStorage = () => false;
KeyringCredentialStore.prototype.listAccounts = async () => [];
KeyringCredentialStore.prototype.get = async () => undefined;
KeyringCredentialStore.prototype.set = async () => {
  throw Error('test must not access native credentials');
};
KeyringCredentialStore.prototype.delete = async () => false;
if (!supplied) process.on('exit', () => rmSync(home, { recursive: true, force: true }));
