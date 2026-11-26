const packageName = '@hithink-tech/dsh-finance';
export const accountNamespace = 'hithinkFinanceAccount';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const phase = new Set(['idle', 'pending', 'connected', 'cancelled', 'error']);
const credentialStates = new Set(['available', 'missing', 'invalid', 'login_required']);

function codec(type, valid) {
  return {
    mode: 'strict',
    typeSymbol: `${packageName}#account:${type}`,
    create: () => ({
      parse(value) {
        if (!valid(value)) throw new TypeError(`Invalid account ${type}.`);
        return value;
      },
    }),
  };
}

const result = codec('state', (value) => Boolean(
  value && typeof value === 'object' && typeof value.ok === 'boolean' &&
  typeof value.connected === 'boolean' && phase.has(value.phase) &&
  [null, 'oauth', 'api-key'].includes(value.method) &&
  credentialStates.has(value.credentials?.oauth) && credentialStates.has(value.credentials?.apiKey) &&
  (value.attemptId === undefined || uuid.test(value.attemptId)) &&
  (value.authorizationUrl === undefined || typeof value.authorizationUrl === 'string') &&
  (value.error === undefined || (typeof value.error?.code === 'string' && typeof value.error?.message === 'string')),
));
const identifier = codec('identifier', (value) => typeof value === 'string' && uuid.test(value));
const confirmation = codec('confirmation', (value) => value === true);
const key = codec('key', (value) => typeof value === 'string' && value.length <= 16 * 1024);
const methodName = codec('method', (value) => value === 'oauth' || value === 'api-key');

const descriptors = [
  ['status', []],
  ['start', [['requesterId', identifier]], true],
  ['cancel', [['requesterId', identifier], ['attemptId', identifier]]],
  ['loginApiKey', [['key', key]]],
  ['selectMethod', [['method', methodName]]],
  ['logout', [['confirm', confirmation]]],
].map(([method, parameters, streamed]) => ({
  id: `${packageName}#${accountNamespace}/${method}`,
  service: accountNamespace,
  namespace: accountNamespace,
  method,
  ...(streamed ? { mode: 'stream', cancellation: { parameter: 'signal' } } : {}),
  invocation: { kind: 'direct' },
  parameters: parameters.map(([name, input]) => ({ name, wire: name, source: 'json', codec: input })),
  result,
}));

export const accountRemote = { package: packageName, descriptors };
export const accountHost = {
  package: packageName,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: descriptors,
};
