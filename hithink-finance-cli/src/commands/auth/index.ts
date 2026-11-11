/**
 * 认证命令模块
 *
 * 管理共享 OAuth/API Key 的登录、状态、切换、迁移和退出。
 *
 * 支持三种 API Key 输入方式：
 * 1. `--api-key <key>`：兼容旧调用的弃用输入（有泄露风险）
 * 2. `--api-key-stdin`：从标准输入管道读取（推荐）
 * 3. 交互式隐藏输入：TTY 环境下使用 muted writable stream 遮蔽回显
 *
 * 凭据通过 GlobalAuthProvider 使用当前用户的共享存储。
 */

import { createInterface } from 'node:readline/promises';
import type { Readable } from 'node:stream';
import { Writable } from 'node:stream';
import type { Command } from 'commander';
import type { CliContext } from '../../cli/context.js';
import { localizeText } from '../../cli/i18n.js';
import type { PackageMetadata } from '../../cli/program.js';
import { successEnvelope } from '../../contracts/envelope.js';
import { cancelledError, CliError } from '../../contracts/errors.js';
import { renderResult } from '../../output/renderer.js';
import type { GlobalAuthProvider } from '../../infrastructure/credentials/global-provider.js';
import { startOAuthLogin } from '../../infrastructure/credentials/oauth-login.js';
import { authError } from '../../infrastructure/credentials/auth-paths.js';
import { readStdin } from '../../infrastructure/filesystem/stdin.js';

interface AuthOptions {
  profile?: string;
  apiKey?: string;
  apiKeyStdin?: boolean;
  input?: boolean;
  all?: boolean;
  replace?: boolean;
  method?: 'oauth' | 'api-key';
  background?: boolean;
  browser?: boolean;
  legacyProfile?: string;
}

const apiKeyHint =
  'Get an API key at https://fuyao.aicubes.cn/admin/, then run `hithink-finance auth login` and paste it into the hidden prompt. In non-interactive shells, use `hithink-finance auth login --api-key-stdin`.';

/**
 * 交互式隐藏 API Key 输入
 *
 * 仅在 TTY 环境下可用（即用户在终端中直接运行 CLI）。
 * 使用 muted Writable stream 作为 readline 的输出目标，
 * 从而在用户输入时不会在屏幕上回显密钥内容。
 *
 * ### 隐藏输入流程
 * 1. 创建一个空操作的 Writable stream —— 所有写入都被静默丢弃
 * 2. 用 process.stdin 和 muted stream 创建 readline 接口（terminal: true 确保逐字符读取）
 * 3. 向 stderr 输出提示文字 "API key: "（与用户输入隔离）
 * 4. 等待用户输入完成后关闭 readline，并在 stderr 换行
 *
 * 非 TTY 环境（如 CI/Pipe）下调用会直接抛出 {@link CliError}，
 * 要求使用 `--api-key-stdin` 或其他非交互方式。
 *
 * @param context - CLI 上下文，提供 stderr 写入能力
 * @returns 用户隐藏输入的 API Key 字符串
 * @throws {CliError} 如果在非 TTY 环境中调用
 */
export async function readHiddenApiKey(
  context: CliContext,
  input: Readable & { isTTY?: boolean } = process.stdin,
): Promise<string> {
  if (input.isTTY !== true) {
    throw new CliError({
      code: 'CLI_MISSING_ARGUMENT',
      category: 'validation',
      message: 'An API key is required in non-interactive mode.',
      hint: apiKeyHint,
      retryable: false,
      exitCode: 2,
    });
  }

  // 创建一个静默丢弃输出的 Writable stream，实现密码不回显
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const readline = createInterface({ input, output: muted, terminal: true });
  context.stderr.write(
    context.language === 'zh-CN'
      ? [
          '欢迎使用同花顺金融数据 CLI',
          '',
          '请前往同花顺金融数据服务官网，登录同花顺账号，创建您的 API Key，复制到当前终端后按 Enter 完成登录。',
          '',
          '官网 API Key 获取地址：https://fuyao.aicubes.cn/admin/',
          '',
          '下方为隐藏输入模式，粘贴或输入时不会显示在终端中；输入完成后按 Enter。',
          '',
          '在此处填写您的 API Key：',
        ].join('\n')
      : [
          'Welcome to HiThink Finance CLI',
          '',
          'Visit the HiThink Finance Data Service website, sign in with your HiThink account, create an API key, paste it into this terminal, then press Enter to finish login.',
          '',
          'API key page: https://fuyao.aicubes.cn/admin/',
          '',
          'The prompt below uses hidden input mode. Typed or pasted characters will not be shown; press Enter when done.',
          '',
          'Paste your API key here:',
        ].join('\n'),
  );
  try {
    return await readline.question('', { signal: context.signal });
  } catch (error) {
    if (context.signal.aborted) throw cancelledError();
    throw error;
  } finally {
    readline.close();
    context.stderr.write('\n');
  }
}

export function registerAuthCommands(
  program: Command,
  context: CliContext,
  metadata: PackageMetadata,
  provider: GlobalAuthProvider,
): void {
  const auth = program
    .command('auth')
    .description(localizeText(context.language, 'Manage global authentication'));
  const login = auth
    .command('login')
    .description(localizeText(context.language, 'Sign in and activate a credential'))
    .option('--method <method>', localizeText(context.language, 'oauth or api-key'))
    .option(
      '--background',
      localizeText(context.language, 'return after the authorization worker is ready'),
    )
    .option(
      '--no-browser',
      localizeText(context.language, 'print the authorization URL without opening a browser'),
    )
    .option(
      '--replace',
      localizeText(context.language, 'replace the saved API key after successful validation'),
    );
  login.action(async () => {
    const options = login.optsWithGlobals<AuthOptions>();
    const hasKey = options.apiKey !== undefined || options.apiKeyStdin === true;
    if (options.method && !['oauth', 'api-key'].includes(options.method))
      throw authError('CLI_INVALID_ARGUMENT', 'Choose oauth or api-key.');
    if (
      (options.method === 'oauth' && hasKey) ||
      (options.apiKey !== undefined && options.apiKeyStdin)
    ) {
      throw new CliError({
        code: 'CLI_CONFLICTING_ARGUMENTS',
        category: 'validation',
        message: 'Choose one authentication method and one key input.',
        hint: 'Remove the conflicting method or input option.',
        retryable: false,
        exitCode: 2,
      });
    }
    const method =
      options.method ??
      (hasKey ? 'api-key' : await provider.loginMethod(options.profile ?? 'default'));
    if (method === 'oauth') {
      const humanProgress =
        !options.background &&
        context.stderr.isTTY === true &&
        (context.format === 'table' ||
          (context.format === 'auto' && context.stdout.isTTY === true));
      if (humanProgress)
        context.stderr.write(localizeText(context.language, 'Preparing sign-in...') + '\n');
      let lastProgress: string | undefined;
      await startOAuthLogin({
        background: options.background === true,
        noBrowser: options.browser === false,
        signal: context.signal,
        output: (url) => context.stdout.write(url + '\n'),
        language: context.language,
        progress: (phase) => {
          const message =
            phase === 'waiting'
              ? 'Complete sign-in and approval in your browser.'
              : 'Completing sign-in...';
          if (humanProgress && message !== lastProgress) {
            context.stderr.write(localizeText(context.language, message) + '\n');
            lastProgress = message;
          }
        },
      });
      if (options.background) return;
    } else {
      if (options.background)
        throw authError(
          'CLI_CONFLICTING_ARGUMENTS',
          'Background authorization is available for OAuth.',
        );
      let apiKey: string;
      if (options.apiKey !== undefined) apiKey = options.apiKey;
      else if (options.apiKeyStdin)
        apiKey = await readStdin(process.stdin, {
          stripFinalNewlines: true,
          signal: context.signal,
          maxBytes: 16 * 1024,
        });
      else {
        if (options.input === false)
          throw new CliError({
            code: 'CLI_MISSING_ARGUMENT',
            category: 'validation',
            message: 'API key input is required.',
            hint: apiKeyHint,
            retryable: false,
            exitCode: 2,
          });
        apiKey = await readHiddenApiKey(context);
      }
      await provider.login({ profile: options.profile ?? 'default', apiKey });
    }
    const result = await provider.status();
    await renderResult(
      successEnvelope('auth.login', result, { requestId: context.requestId }),
      context,
    );
  });
  auth
    .command('status')
    .description(localizeText(context.language, 'Read local authentication state'))
    .action(async () => {
      const status = await provider.status();
      await renderResult(
        successEnvelope('auth.status', status, { requestId: context.requestId }),
        context,
      );
      context.exitCode = status.connected ? 0 : 3;
    });
  const use = auth
    .command('use')
    .argument('<method>', localizeText(context.language, 'oauth or api-key'))
    .description(localizeText(context.language, 'Select a saved credential'));
  use.action(async (method: string) => {
    if (method !== 'oauth' && method !== 'api-key')
      throw authError('CLI_INVALID_ARGUMENT', 'Choose oauth or api-key.');
    await provider.use(method);
    await renderResult(
      successEnvelope('auth.use', await provider.status(), { requestId: context.requestId }),
      context,
    );
  });
  const migrate = auth
    .command('migrate')
    .description(localizeText(context.language, 'Import previous credentials into the shared file'))
    .option(
      '--legacy-profile <name>',
      localizeText(context.language, 'legacy credential to import once'),
    );
  migrate.action(async () => {
    const options = migrate.optsWithGlobals<AuthOptions>();
    await provider.migrate(options.legacyProfile);
    const status = await provider.status();
    await renderResult(
      successEnvelope('auth.migrate', status, { requestId: context.requestId }),
      context,
    );
  });
  const logout = auth
    .command('logout')
    .description(localizeText(context.language, 'End the active local session'))
    .option('--all', localizeText(context.language, 'remove both saved credential types'));
  logout.action(async () => {
    const all = logout.optsWithGlobals<AuthOptions>().all === true;
    if (all) await provider.logoutAll();
    else await provider.logout();
    await renderResult(
      successEnvelope(
        'auth.logout',
        { removed: true, all, cli_version: metadata.version },
        { requestId: context.requestId },
      ),
      context,
    );
  });
}
