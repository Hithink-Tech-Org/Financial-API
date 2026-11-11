import { Writable } from 'node:stream';
import { expect, test, vi } from 'vitest';
import { createProgram } from '../../src/cli/program.js';
import { createPlatformPaths } from '../../src/infrastructure/filesystem/platform-paths.js';
import type { CliContext, OutputFormat } from '../../src/cli/context.js';
import type { GlobalAuthProvider } from '../../src/infrastructure/credentials/global-provider.js';
import type { startOAuthLogin } from '../../src/infrastructure/credentials/oauth-login.js';

vi.mock('../../src/infrastructure/credentials/oauth-login.js', () => ({
  startOAuthLogin: async (options: Parameters<typeof startOAuthLogin>[0]) => {
    options.output('https://auth.example.invalid/authorize');
    for (const phase of ['waiting', 'exchanging', 'validating', 'saving'] as const)
      options.progress?.(phase);
  },
}));

async function login(format: OutputFormat, stdoutTTY: boolean, background = false) {
  let out = '',
    err = '';
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        out += chunk.toString();
        done();
      },
    }),
    { isTTY: stdoutTTY },
  );
  const stderr = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        err += chunk.toString();
        done();
      },
    }),
    { isTTY: true },
  );
  const context = {
    format,
    language: 'zh-CN',
    color: false,
    requestId: 'progress-test',
    stdout,
    stderr,
    debug: false,
    signal: new AbortController().signal,
  } as unknown as CliContext;
  const paths = createPlatformPaths({ homeDir: process.cwd(), env: {} });
  const provider = {
    status: async () => ({
      connected: true,
      active_method: 'oauth',
      credentials: { oauth: { state: 'available' }, 'api-key': { state: 'missing' } },
      pending: null,
      storage: { backend: 'file', path: 'diagnostic-only-location', encrypted: false },
    }),
  };
  const program = createProgram({ name: 'test-cli', version: '0.1.15' }, context, {
    authProvider: provider as unknown as GlobalAuthProvider,
    fuyaoBaseUrl: 'https://api.example.invalid',
    packageRoot: process.cwd(),
    platformPaths: paths,
    resolvedConfig: { dbPath: paths.defaultDbPath, profile: 'default', format, updateCheck: false },
  });
  await program.parseAsync([
    'node',
    'cli',
    'auth',
    'login',
    '--method',
    'oauth',
    '--no-browser',
    ...(background ? ['--background'] : []),
  ]);
  return { out, err };
}
test('interactive sign-in only reports useful, deduplicated progress', async () => {
  const result = await login('table', true);
  expect(result.err).toContain('正在准备登录');
  expect(result.err).toContain('请在浏览器');
  expect(result.err.match(/正在完成登录/gu)).toHaveLength(1);
  expect(result.err).not.toMatch(/保存|明文|私有权限/u);
  expect(result.out).not.toMatch(/明文|私有权限|diagnostic-only-location|存储方式/u);
});
test.each(['json', 'ndjson', 'csv', 'auto'] as const)(
  'piped %s sign-in does not emit interactive progress or storage details',
  async (format) => {
    const result = await login(format, false);
    expect(result.err).toBe('');
    expect(result.out).not.toMatch(/diagnostic-only-location|"storage"|encrypted/u);
  },
);
test('background sign-in keeps the independent URL contract', async () => {
  const result = await login('auto', false, true);
  expect(result.out).toBe('https://auth.example.invalid/authorize\n');
  expect(result.err).toBe('');
});
