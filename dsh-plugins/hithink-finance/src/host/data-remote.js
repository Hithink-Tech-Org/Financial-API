const packageName = '@hithink-tech/dsh-finance';
export const dataNamespace = 'hithinkFinanceData';
export const dataActions = ['init', 'sync', 'validate', 'repair'];
export const validSyncTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function codec(name, valid) {
  return {
    mode: 'strict',
    typeSymbol: `${packageName}#data:${name}`,
    create: () => ({ parse(value) {
      if (!valid(value)) throw new TypeError(`Invalid local data ${name}.`);
      return value;
    } }),
  };
}

const action = codec('action', (value) => dataActions.includes(value));
const schedule = codec('schedule', (value) => typeof value?.enabled === 'boolean' && validSyncTime(value.time));
const databasePath = codec('database-path', (value) => typeof value === 'string' &&
  value.length > 0 && value.length <= 32_767);
const result = codec('result', (value) => value?.ok === true ? Object.hasOwn(value, 'data')
  : value?.ok === false && typeof value.error?.message === 'string' && typeof value.error?.code === 'string');
const descriptors = [
  ['status'], ['run', ['action', action], ['expectedDatabasePath', databasePath]],
  ['setSchedule', ['schedule', schedule]],
].map(([method, ...parameters]) => ({
  id: `${packageName}#${dataNamespace}/${method}`,
  service: dataNamespace,
  namespace: dataNamespace,
  method,
  invocation: { kind: 'direct' },
  parameters: parameters.map(([name, parameter]) => ({ name, wire: name, source: 'json', codec: parameter })),
  result,
}));

export const dataRemote = { package: packageName, descriptors };
