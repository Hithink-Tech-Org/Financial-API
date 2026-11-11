import { createRequire } from 'node:module';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { CommanderError } from 'commander';
import { createCliContext, inferCommand, optionValue, type OutputFormat } from './context.js';
import { createProgram, commanderError, type PackageMetadata } from './program.js';
import { errorEnvelope } from '../contracts/envelope.js';
import { internalError } from '../contracts/errors.js';
import { renderResult } from '../output/renderer.js';
import { createGlobalAuthProvider } from '../infrastructure/credentials/auth-factory.js';
import { assertAuthRuntime } from '../infrastructure/credentials/auth-paths.js';
import { createPlatformPaths } from '../infrastructure/filesystem/platform-paths.js';
import { loadConfig } from '../application/config.js';
import { maybeEmitCachedUpdateNotice } from '../infrastructure/updater/check.js';
import { createProcessShutdown, shutdownExitCode } from '../infrastructure/process/shutdown.js';

const metadata = createRequire(import.meta.url)('../../package.json') as PackageMetadata;
export interface CommandRuntime {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: Readable;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  signal?: AbortSignal;
}

export async function renderFailure(
  argv: readonly string[],
  error: unknown,
  runtime: CommandRuntime = {},
  context = createCliContext(argv, runtime),
): Promise<number> {
  const classified =
    error instanceof CommanderError
      ? commanderError(error, context.language)
      : internalError(error);
  await renderResult(
    errorEnvelope(inferCommand(argv), classified, metadata.version, {
      debug: context.debug,
      requestId: context.requestId,
      ...(metadata.bugs?.url ? { bugReportBaseUrl: metadata.bugs.url } : {}),
    }),
    context,
  );
  return shutdownExitCode(context.signal.reason) ?? classified.exitCode;
}

/** One invocation has its own configuration, credentials, parser, streams and cancellation. */
export async function executeCommand(
  input: readonly string[],
  runtime: CommandRuntime = {},
): Promise<number> {
  const argv = input.length ? [...input] : ['--help'];
  let context = createCliContext(argv, runtime);
  try {
    assertAuthRuntime();
    const env = runtime.env ?? process.env;
    const paths = createPlatformPaths({ env });
    const configPath = optionValue(argv, '--config');
    const dbPath = optionValue(argv, '--db');
    const profile = optionValue(argv, '--profile');
    const format = optionValue(argv, '--format');
    const language = optionValue(argv, '--lang');
    const resolved = await loadConfig({
      paths,
      env,
      cwd: context.cwd!,
      cli: {
        ...(configPath === undefined ? {} : { configPath }),
        ...(dbPath === undefined ? {} : { dbPath }),
        ...(profile === undefined ? {} : { profile }),
        ...(format === undefined ? {} : { format: format as OutputFormat }),
        ...(language === 'en' || language === 'zh-CN' ? { language } : {}),
      },
    });
    context = createCliContext(argv, {
      ...runtime,
      format: resolved.format,
      ...(resolved.language ? { language: resolved.language } : {}),
    });
    const baseUrl = env.HITHINK_FINANCE_FUYAO_BASE_URL ?? 'https://fuyao.aicubes.cn';
    const packageRoot = path.resolve(import.meta.dirname, '../..');
    const program = createProgram(metadata, context, {
      authProvider: createGlobalAuthProvider(baseUrl, env),
      fuyaoBaseUrl: baseUrl,
      packageRoot,
      platformPaths: { ...paths, defaultDbPath: resolved.dbPath },
      resolvedConfig: resolved,
    });
    await program.parseAsync(argv, { from: 'user' });
    if (!['update', 'auth', 'doctor'].includes(inferCommand(argv)))
      await maybeEmitCachedUpdateNotice({
        packageRoot,
        packageName: metadata.name,
        currentVersion: metadata.version,
        cacheFile: path.join(paths.stateDir, 'update-cache.json'),
        stderr: context.stderr,
        disabled: !resolved.updateCheck,
      });
    return context.exitCode ?? 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    return renderFailure(argv, error, runtime, context);
  }
}

export async function runForeground(argv: readonly string[], input?: string): Promise<void> {
  const shutdown = createProcessShutdown();
  try {
    const stdin =
      input === undefined ? process.stdin : (await import('node:stream')).Readable.from([input]);
    process.exitCode = await executeCommand(argv, { signal: shutdown.signal, stdin });
  } finally {
    shutdown.dispose();
  }
}
