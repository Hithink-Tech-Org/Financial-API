const packageName = '@hithink-tech/dsh-finance';
export const workbenchNamespace = 'hithinkFinanceWorkbench';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function codec(name, valid) {
  return {
    mode: 'strict',
    typeSymbol: `${packageName}#workbench:${name}`,
    create: () => ({
      parse(value) {
        if (!valid(value)) throw new TypeError(`Invalid workbench ${name}.`);
        return value;
      },
    }),
  };
}

const isIdentifier = (value) => typeof value === 'string' && value.length <= 80;
const id = codec('identifier', isIdentifier);
const pageReference = codec('page-reference', (value) => isIdentifier(value) ||
  (record(value) && isIdentifier(value.id) && typeof value.expectedDirectory === 'string' && value.expectedDirectory.length <= 2048));
const input = codec('input', record);
const result = codec('result', (value) => record(value) && (value.ok === true ? Object.hasOwn(value, 'data') :
  value.ok === false && typeof value.error?.code === 'string' && typeof value.error?.message === 'string'));

const descriptors = [
  ['list'], ['get', 'id', pageReference], ['update', 'input', input], ['deletePage', 'input', input],
  ['storage'], ['setStorage', 'input', input],
  ['templateList'], ['templateGet', 'id', id], ['applyTemplate', 'input', input], ['query', 'input', input],
  ['liveCase', 'input', input],
].map(([method, name, parameter]) => ({
  id: `${packageName}#${workbenchNamespace}/${method}`,
  service: workbenchNamespace,
  namespace: workbenchNamespace,
  method,
  ...(method === 'liveCase' ? { mode: 'stream', cancellation: { parameter: 'signal' } } : {}),
  invocation: { kind: 'direct' },
  parameters: name ? [{ name, wire: name, source: 'json', codec: parameter }] : [],
  result,
}));

export const workbenchRemote = { package: packageName, descriptors };
export const workbenchHost = {
  package: packageName, face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: descriptors,
};
