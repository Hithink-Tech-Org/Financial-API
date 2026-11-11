import { Writable } from 'node:stream';
import { Readable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import { createProgram } from '../../src/cli/program.js';
import type { CliContext } from '../../src/cli/context.js';
import type { GlobalAuthProvider } from '../../src/infrastructure/credentials/global-provider.js';
import { createPlatformPaths } from '../../src/infrastructure/filesystem/platform-paths.js';
import { readHiddenApiKey } from '../../src/commands/auth/index.js';

class MemoryWriteStream extends Writable {
  readonly chunks: string[] = [];
  isTTY = false;

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
    callback();
  }

  text(): string {
    return this.chunks.join('');
  }
}

describe('auth login command', () => {
  test('explains the API key source and hidden input before reading interactively', async () => {
    const stderr = new MemoryWriteStream();
    const input = Readable.from(['interactive-secret\n']) as Readable & { isTTY?: boolean };
    input.isTTY = true;
    const context = {
      language: 'zh-CN',
      stderr: stderr as unknown as NodeJS.WriteStream,
    } as CliContext;

    await expect(readHiddenApiKey(context, input)).resolves.toBe('interactive-secret');

    expect(stderr.text()).toContain('欢迎使用同花顺金融数据 CLI');
    expect(stderr.text()).toContain('官网 API Key 获取地址：https://fuyao.aicubes.cn/admin/');
    expect(stderr.text()).toContain('下方为隐藏输入模式');
    expect(stderr.text()).toContain('在此处填写您的 API Key：');
  });

  test('keeps the English interactive login guidance aligned with the Chinese prompt', async () => {
    const stderr = new MemoryWriteStream();
    const input = Readable.from(['interactive-secret\n']) as Readable & { isTTY?: boolean };
    input.isTTY = true;
    const context = {
      language: 'en-US',
      stderr: stderr as unknown as NodeJS.WriteStream,
    } as CliContext;

    await expect(readHiddenApiKey(context, input)).resolves.toBe('interactive-secret');

    expect(stderr.text()).toContain('Welcome to HiThink Finance CLI');
    expect(stderr.text()).toContain('API key page: https://fuyao.aicubes.cn/admin/');
    expect(stderr.text()).toContain('hidden input mode');
    expect(stderr.text()).toContain('Paste your API key here:');
  });

  function program(provider: GlobalAuthProvider) {
    const output = new MemoryWriteStream();
    const paths = createPlatformPaths({ homeDir: process.cwd(), env: {} });
    return createProgram(
      { name: 'test-cli', version: '0.1.15' },
      {
        format: 'json',
        language: 'en',
        color: false,
        requestId: 'test',
        stdout: output as unknown as NodeJS.WriteStream,
        stderr: output as unknown as NodeJS.WriteStream,
        signal: new AbortController().signal,
        debug: false,
      },
      {
        authProvider: provider,
        fuyaoBaseUrl: 'https://api.example.test',
        packageRoot: process.cwd(),
        platformPaths: paths,
        resolvedConfig: {
          dbPath: paths.defaultDbPath,
          profile: 'default',
          format: 'json',
          updateCheck: false,
        },
      },
    );
  }
  test('explicit key login replaces an existing credential without an early success', async () => {
    const login = vi.fn(async () => undefined);
    const status = vi.fn(async () => ({
      connected: true,
      active_method: 'api-key',
      storage: { backend: 'keyring' },
    }));
    await program({ login, status } as unknown as GlobalAuthProvider).parseAsync([
      'node',
      'cli',
      'auth',
      'login',
      '--api-key',
      'test-input',
      '--replace',
    ]);
    expect(login).toHaveBeenCalledWith({ profile: 'default', apiKey: 'test-input' });
  });
  test('rejects OAuth/key conflicts before consuming stdin', async () => {
    const login = vi.fn();
    await expect(
      program({ login } as unknown as GlobalAuthProvider).parseAsync([
        'node',
        'cli',
        'auth',
        'login',
        '--method',
        'oauth',
        '--api-key-stdin',
      ]),
    ).rejects.toMatchObject({ code: 'CLI_CONFLICTING_ARGUMENTS' });
    expect(login).not.toHaveBeenCalled();
  });
});
