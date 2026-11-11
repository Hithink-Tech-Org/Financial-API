/**
 * 渲染协调模块 — 根据输出上下文选择渲染策略。
 *
 * ## 自动格式选择逻辑（resolvedFormat）：
 * ```
 * context.format === 'auto' ?
 *   └─ stdout.isTTY === true  →  'table'   (交互式终端，显示表格)
 *   └─ stdout.isTTY === false →  'json'    (管道/重定向，输出 JSON)
 * ```
 *
 * 设计意图：
 * - TTY 终端（人类直接查看）→ 表格格式更易读
 * - 管道/重定向（程序消费）→ JSON 格式便于下游处理
 * - 用户可通过 --format 显式覆盖自动选择
 *
 * ## 错误渲染
 * 非 JSON 格式的错误输出：
 * - 格式：`hithink-finance v{version} — Error ({code}): {message}\n{hint}\n`
 * - 输出到 stderr
 */
import type { CliContext, OutputFormat } from '../cli/context.js';
import { once } from 'node:events';
import type { Envelope } from '../contracts/envelope.js';
import { renderJson } from './json.js';
import { renderTable } from './table.js';
import { csvLines } from './records.js';
import { renderDataView } from './data-view.js';
import {
  authenticationResult,
  authenticationView,
  chineseAuthenticationErrors,
} from './authentication.js';

/**
 * 根据 context 解析实际输出格式。
 *
 * auto 模式下根据 stdout 是否为 TTY 选择 table 或 json。
 *
 * @param context - CLI 运行时上下文
 * @returns 确定的输出格式（非 'auto'）
 */
function resolvedFormat(context: CliContext): Exclude<OutputFormat, 'auto'> {
  if (context.format !== 'auto') {
    return context.format;
  }
  // 自动检测：交互式终端 → 表格，管道 → JSON
  return context.stdout.isTTY === true ? 'table' : 'json';
}

function red(value: string, enabled: boolean): string {
  return enabled ? `\u001B[31m${value}\u001B[39m` : value;
}

function terminalLink(label: string, url: string, enabled: boolean): string {
  return enabled ? `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007` : url;
}

/**
 * 将 Envelope 渲染到正确的输出流。
 *
 * 路由规则：
 * - result.ok → stdout
 * - !result.ok → stderr
 *
 * 格式规则：
 * - json/ndjson → renderJson（snake_case 化 + JSON 序列化）
 * - table 且 ok → renderTable（表格或 JSON fallback）
 * - table 且 error → 格式化错误消息（hithink-finance v{ver} — Error ...）
 *
 * @param result  - 结果信封（ok: data 或 error: 错误信息）
 * @param context - CLI 运行时上下文
 */
export async function renderResult(result: Envelope, context: CliContext): Promise<void> {
  if (result.ok && result.command.startsWith('auth.'))
    result = { ...result, data: authenticationResult(result.data, context.debug) };
  if (!result.ok && context.language === 'zh-CN') {
    const translated = chineseAuthenticationErrors[result.error.code];
    if (translated)
      result = {
        ...result,
        error: { ...result.error, message: translated[0], hint: translated[1] },
      };
    else if (result.command.startsWith('auth') && result.error.code === 'UPSTREAM_NETWORK_FAILURE')
      result = {
        ...result,
        error: {
          ...result.error,
          message: '登录验证暂时无法连接数据服务。',
          hint: '检查网络或数据服务状态，然后重新运行 hithink-finance auth login。',
        },
      };
  }
  // 成功结果输出到 stdout，错误输出到 stderr
  const stream = result.ok ? context.stdout : context.stderr;
  const format = resolvedFormat(context);

  // JSON / NDJSON 模式：统一序列化
  if (format === 'json' || format === 'ndjson') {
    stream.write(renderJson(result, format === 'json' && context.format === 'json'));
    return;
  }

  if (format === 'csv' && result.ok) {
    for (const line of csvLines(result.data)) {
      if (!stream.write(line)) await once(stream, 'drain', { signal: context.signal });
    }
    return;
  }

  // 表格模式下的错误输出
  if (!result.ok) {
    const label =
      context.language === 'zh-CN' && result.command.startsWith('auth') ? '错误' : 'Error';
    const errorLabel = red(`${label} (${result.error.code})`, context.color);
    const lines = [
      `hithink-finance v${result.meta.cliVersion} — ${errorLabel}: ${result.error.message}`,
      result.error.hint,
    ];
    if (result.error.reportUrl !== undefined) {
      lines.push(
        `Report: ${terminalLink('open issue form', result.error.reportUrl, context.color)}`,
      );
    }
    if (result.meta.diagnostics !== undefined) {
      lines.push(`Request ID: ${result.meta.diagnostics.requestId}`);
      lines.push(result.meta.diagnostics.stack);
    }
    stream.write(`${lines.join('\n')}\n`);
    return;
  }

  // 表格模式下的成功输出
  if (
    /^(symbol|market|index|financials|fund|futures|options|valuation|special|ipo|news|db)\./u.test(
      result.command,
    )
  ) {
    stream.write(renderDataView(result, context));
    return;
  }
  stream.write(
    renderTable(
      context.language === 'zh-CN' && result.command.startsWith('auth')
        ? authenticationView(result.data, context.debug)
        : result.data,
      context.stdout.columns,
    ),
  );
}
