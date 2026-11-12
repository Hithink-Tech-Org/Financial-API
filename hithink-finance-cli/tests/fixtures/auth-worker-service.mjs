// Offline service adapter for real worker lifecycle tests. Never shipped.
import { randomUUID } from 'node:crypto';
import { OAuthClient } from '../../dist/infrastructure/credentials/oauth-client.js';
import { FuyaoClient } from '../../dist/infrastructure/fuyao/client.js';
if (!process.env.HITHINK_TEST_USER_HOME) throw Error('isolated home required');
OAuthClient.prototype.authorize = async function () {
  const state = randomUUID();
  return { state, verifier: randomUUID(), url: `https://auth.example.test/?state=${state}` };
};
OAuthClient.prototype.exchange = async function (_attempt, callback) {
  if (callback.searchParams.has('error'))
    throw Object.assign(Error('test authorization denied'), { code: 'AUTH_OAUTH_PROTOCOL' });
  return {
    access_token: randomUUID(),
    refresh_token: randomUUID(),
    expires_at: Date.now() + 300000,
    scope: 'offline_access fuyao:data.read',
    binding: this.binding,
  };
};
OAuthClient.prototype.revoke = async () => undefined;
FuyaoClient.prototype.request = async () => ({});
