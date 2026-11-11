import { Writable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { renderResult } from '../../src/output/renderer.js';
import { errorEnvelope, successEnvelope } from '../../src/contracts/envelope.js';
import { CliError } from '../../src/contracts/errors.js';
import type { CliContext, OutputFormat } from '../../src/cli/context.js';

const location = path.join(os.tmpdir(), 'finance-output-test', 'auth.json');
const status = {
  connected: true,
  active_method: 'oauth',
  credentials: { oauth: { state: 'available' }, 'api-key': { state: 'missing' } },
  pending: null,
  storage: {
    backend: 'file',
    available: true,
    path: location,
    encrypted: false,
    cleanup_pending: false,
  },
};
async function output(format: OutputFormat, language: 'zh-CN' | 'en', debug = false) {
  let value = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      value += chunk.toString();
      done();
    },
  });
  await renderResult(successEnvelope('auth.status', status, { requestId: 'output-test' }), {
    format,
    language,
    debug,
    color: false,
    requestId: 'output-test',
    stdout: stream,
    stderr: stream,
  } as unknown as CliContext);
  return value;
}

test.each(['json', 'ndjson', 'csv', 'table'] as const)(
  'normal auth %s contains useful state without storage internals',
  async (format) => {
    for (const language of ['zh-CN', 'en'] as const) {
      const value = await output(format, language);
      expect(value).not.toContain(location);
      expect(value).not.toMatch(/凭据文件|存储方式|encrypted|cleanup_pending|"storage"/u);
      if (format === 'json' || format === 'ndjson') {
        expect(JSON.parse(value).data).toEqual({
          connected: true,
          active_method: 'oauth',
          credentials: status.credentials,
          pending: null,
        });
      }
    }
    expect(status.storage.path).toBe(location);
  },
);

test('storage diagnostics remain available only when explicitly requested', async () => {
  expect(JSON.parse(await output('json', 'zh-CN', true)).data.storage).toEqual(status.storage);
  expect(await output('table', 'zh-CN', true)).toContain(location);
});

test('unrelated data output is not projected as authentication state', async () => {
  let value = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      value += chunk.toString();
      done();
    },
  });
  await renderResult(
    successEnvelope('schema', { storage: { path: location } }, { requestId: 'output-test' }),
    {
      format: 'json',
      language: 'zh-CN',
      debug: false,
      stdout: stream,
      stderr: stream,
    } as unknown as CliContext,
  );
  expect(JSON.parse(value).data.storage.path).toBe(location);
});

test.each(['auth.login', 'auth.migrate'])(
  'network failure in %s does not claim browser authorization occurred',
  async (command) => {
    let value = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        value += chunk.toString();
        done();
      },
    });
    await renderResult(
      errorEnvelope(
        command,
        new CliError({
          code: 'UPSTREAM_NETWORK_FAILURE',
          category: 'upstream',
          message: 'Service unavailable',
          hint: 'Retry',
          retryable: true,
          exitCode: 4,
        }),
        '0.1.15',
        { requestId: 'output-test' },
      ),
      {
        format: 'json',
        language: 'zh-CN',
        debug: false,
        stdout: stream,
        stderr: stream,
      } as unknown as CliContext,
    );
    const error = JSON.parse(value).error;
    expect(error.code).toBe('UPSTREAM_NETWORK_FAILURE');
    expect(error.message).not.toContain('浏览器');
    expect(error.message).toContain('连接');
  },
);
