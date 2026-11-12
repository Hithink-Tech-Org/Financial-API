import { expect, test } from 'vitest';
// @ts-expect-error Maintainer generator is plain JavaScript.
import { connectorFiles } from '../../scripts/package-workbuddy.mjs';
test('connector requires delivered configuration and uses one shared CLI with text status matching', () => {
  expect(() => connectorFiles(undefined, '1.0.0', 'auth.example.test')).toThrow();
  const files = connectorFiles(
    { endpointOrigins: ['https://auth.example.test'] },
    '1.0.0',
    'auth.example.test',
  );
  expect(files['connector-meta.json']).toMatchObject({
    name: '同花顺金融数据 CLI',
    name_zh: '同花顺金融数据 CLI',
    name_en: 'HiThink Finance CLI',
    type: 'cli',
  });
  expect(files['cli.json'].runtime).toEqual({ type: 'node', version: '24' });
  expect(files['cli.json'].npmRegistries).toEqual([
    'https://registry.npmmirror.com',
    'https://registry.npmjs.org',
  ]);
  expect(files['cli.json'].init).toEqual({
    darwin: 'npm install -g @hithink-tech/hithink-finance-cli@latest',
    linux: 'npm install -g @hithink-tech/hithink-finance-cli@latest',
    win32: 'npm install -g @hithink-tech/hithink-finance-cli@latest',
  });
  expect(files['cli.json'].versionCheck).toEqual({
    command: {
      darwin: 'hithink-finance --version',
      linux: 'hithink-finance --version',
      win32: 'hithink-finance.cmd --version',
    },
    minVersion: '1.0.0',
  });
  const matcher = new RegExp(files['cli.json'].statusMatch);
  expect(matcher.test('{"data":{"connected":true}}')).toBe(true);
  expect(matcher.test('{"data":{"connected":false,"pending":true}}')).toBe(false);
  expect(files['cli.json'].auth.win32).toContain('--method oauth --background --no-browser');
  expect(() =>
    connectorFiles(
      { endpointOrigins: ['https://auth.example.test'] },
      '1.0.0',
      'evil.example.test',
    ),
  ).toThrow();
});
