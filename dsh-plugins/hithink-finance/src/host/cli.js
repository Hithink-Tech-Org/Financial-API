import { spawn } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CLI_PACKAGE = '@hithink-tech/hithink-finance-cli';
const MAX_CAPTURE = 128 * 1024;
const AUTH_ORIGIN = 'https://upass.10jqka.com.cn';
const CALLBACK = 'http://127.0.0.1:18765/oauth/callback';
const dataProcess = fileURLToPath(new URL('./data-cli-process.js', import.meta.url));

export class FinanceError extends Error {
  constructor(code, message, requestId) {
    super(message);
    this.code = code;
    if (requestId) this.requestId = requestId;
  }
}

const messages = {
  AUTH_CALLBACK_PORT_IN_USE: '授权回调端口正被使用。关闭其他同花顺金融数据授权后重试。',
  AUTH_LOGIN_CANCELLED: '本次授权已取消或超时。请重新连接账号。',
  AUTH_LOGIN_FAILED: '本次授权未完成。请在插件账号页重新连接。',
  AUTH_LOGIN_REQUIRED: '请在同花顺金融数据插件的账号页连接或重新连接账号。',
  AUTH_OAUTH_NOT_CONFIGURED: '当前安装包无法启动账号授权。请检查插件版本。',
  AUTH_WORKER_TIMEOUT: '启动授权超时。检查网络后重新连接账号。',
  AUTH_REVOCATION_INCOMPLETE: '本机凭证已清除，远端撤销未确认。',
  AUTH_API_KEY_EMPTY: '请输入 API Key。',
  FUYAO_2001: '凭证验证失败。请检查 API Key 是否有效。',
  FUYAO_2003: '当前凭证没有所需的数据访问权限。',
  UPSTREAM_NETWORK_FAILURE: '暂时无法连接同花顺金融数据服务。请检查网络后重试。',
};

export function publicError(error) {
  const safe = error instanceof FinanceError
    ? error
    : new FinanceError('FINANCE_INTERNAL_ERROR', '同花顺金融数据插件执行失败。请重新操作。');
  return {
    code: safe.code,
    message: safe.message,
    ...(safe.requestId ? { requestId: safe.requestId } : {}),
  };
}

export function requestId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,96}$/i.test(value) ? value : undefined;
}

function cliError(envelope) {
  const raw = envelope.error;
  const code = typeof raw?.code === 'string' && /^(?:(?:AUTH|CLI|UPSTREAM|LOCAL|DATA|DB)_[A-Z0-9_]{1,75}|FUYAO_\d{1,10})$/.test(raw.code)
    ? raw.code
    : 'FINANCE_CLI_ERROR';
  const message = messages[code] ?? (code.startsWith('AUTH_STORAGE_')
    ? '读取或保存本机凭证失败。请检查本机权限后重试。'
    : '账号操作未完成。请在插件账号页检查连接状态。');
  return new FinanceError(code, message, requestId(raw?.request_id ?? raw?.requestId) ??
    requestId(envelope.meta?.request_id ?? envelope.meta?.requestId));
}

function parseEnvelope(text) {
  try {
    const envelope = JSON.parse(text);
    if (typeof envelope?.ok === 'boolean' && typeof envelope.command === 'string') return envelope;
  } catch {
    // CLI output is private and can contain credentials or a partial result.
  }
  return null;
}

export function checkedEnvelope(result, operation, acceptedCodes = [0]) {
  const stdout = parseEnvelope(result.stdout);
  const stderr = parseEnvelope(result.stderr);
  if (stdout?.command === operation && stdout.ok && acceptedCodes.includes(result.exitCode) &&
      Object.hasOwn(stdout, 'data') && !stderr) return stdout;
  const failure = [stderr, stdout].find((envelope) => envelope?.ok === false);
  if (failure && !stdout?.ok && result.exitCode !== 0) throw cliError(failure);
  throw new FinanceError('FINANCE_INVALID_RESPONSE', 'CLI 响应不完整或返回状态不一致。请重试。');
}

export function resolveCliPackage() {
  try {
    const manifest = require.resolve(`${CLI_PACKAGE}/package.json`);
    const directory = realpathSync(dirname(manifest));
    const metadata = JSON.parse(readFileSync(manifest, 'utf8'));
    const bin = metadata.bin?.['hithink-finance'];
    if (metadata.name !== CLI_PACKAGE || typeof bin !== 'string' || !bin || isAbsolute(bin)) throw new Error();
    const entry = realpathSync(resolve(directory, bin));
    const child = relative(directory, entry);
    if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child) || !statSync(entry).isFile()) throw new Error();
    return { entry, directory };
  } catch {
    throw new FinanceError('FINANCE_CLI_UNAVAILABLE', '找不到插件自带的金融数据 CLI。请重新安装插件。');
  }
}

export function authorizationUrl(line) {
  if (line.length > 8192 || !line.startsWith(AUTH_ORIGIN + '/')) return undefined;
  try {
    const url = new URL(line);
    if (url.origin === AUTH_ORIGIN && !url.username && !url.password && !url.hash &&
        url.searchParams.get('redirect_uri') === CALLBACK && url.searchParams.has('state') &&
        url.searchParams.get('code_challenge_method') === 'S256') return line;
  } catch {
    // The CLI may emit diagnostics before a valid URL.
  }
  return undefined;
}

export function createCliRunner({ resolvePackage = resolveCliPackage, spawnProcess = spawn } = {}) {
  let cli;
  const getPackage = () => (cli ??= resolvePackage());
  function run(argv, {
    signal, timeoutMs = 45_000, onLine, stdin, maxCaptureBytes = MAX_CAPTURE, maintenance = false,
  } = {}) {
    if (signal?.aborted) return Promise.reject(cancelled());
    const { entry, directory } = getPackage();
    const env = {
      ...process.env,
      HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
      HITHINK_FINANCE_NO_WORKER: '1',
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    delete env.HITHINK_FINANCE_FUYAO_BASE_URL;
    return new Promise((resolveRun, reject) => {
      let child;
      try {
        const processArguments = maintenance ? [dataProcess, resolve(directory, 'dist/cli/run.js')] : [entry];
        const stdio = [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'];
        if (maintenance) stdio.push('ipc');
        child = spawnProcess(process.execPath, [...processArguments, ...argv, '--format', 'json', '--no-input'], {
          env, shell: false, windowsHide: true, stdio,
        });
      } catch {
        reject(new FinanceError('FINANCE_CLI_START_FAILED', '无法启动金融数据 CLI。请检查插件安装和 Node.js 版本。'));
        return;
      }

      const stdout = [];
      const stderr = [];
      const decoder = new StringDecoder('utf8');
      let firstLine = '';
      let readLine = Boolean(onLine);
      let bytes = 0;
      let failure;
      let force;
      const stop = (error) => {
        if (failure) return;
        failure = error;
        // Windows signals can terminate Node before the CLI has finalized an import.
        if (maintenance) {
          if (child.connected) child.send('cancel', () => {});
          return;
        }
        child.kill('SIGTERM');
        force = setTimeout(() => child.kill('SIGKILL'), 3000);
        force.unref?.();
      };
      const cancel = () => stop(cancelled());
      const timer = setTimeout(() => stop(new FinanceError('FINANCE_TIMEOUT',
        maintenance ? '本地数据操作超时。请重试。' : '账号操作超时。请重试。')), timeoutMs);
      timer.unref?.();
      function consume(chunks, chunk) {
        if (failure) return;
        bytes += chunk.length;
        if (bytes > maxCaptureBytes) {
          stop(new FinanceError('FINANCE_OUTPUT_TOO_LARGE', '账号操作返回的数据超过处理上限。请重试。'));
          return;
        }
        chunks.push(chunk);
        if (chunks !== stdout || !readLine) return;
        firstLine += decoder.write(chunk);
        const end = firstLine.indexOf('\n');
        if (end !== -1) {
          onLine(firstLine.slice(0, end).replace(/\r$/, ''));
          readLine = false;
        } else if (firstLine.length > 8192) readLine = false;
      }
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      child.stdout.on('data', (chunk) => consume(stdout, chunk));
      child.stderr.on('data', (chunk) => consume(stderr, chunk));
      child.once('error', () => {
        failure ??= new FinanceError('FINANCE_CLI_START_FAILED', '无法启动金融数据 CLI。请检查插件安装和 Node.js 版本。');
      });
      child.once('close', (exitCode) => {
        signal?.removeEventListener('abort', cancel);
        clearTimeout(timer);
        clearTimeout(force);
        if (failure) reject(failure);
        else resolveRun({
          exitCode,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
      if (stdin !== undefined) {
        child.stdin.on('error', () => {
          // A child can exit before reading stdin. Its exit result supplies the error.
        });
        child.stdin.end(stdin, 'utf8');
      }
    });
  }
  return { run };
}

export function cancelled() {
  return new FinanceError('FINANCE_CANCELLED', '本次金融数据操作已取消。');
}
