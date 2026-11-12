import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deliveredOAuthConfig } from '../dist/infrastructure/credentials/oauth-client.js';

export function connectorFiles(product, version, authorizationDomain, connectorVersion = version) {
  if (!product)
    throw Error('OAuth service configuration must be delivered before packaging a connector.');
  if (
    !/^[a-z0-9.-]+$/u.test(authorizationDomain ?? '') ||
    !product.endpointOrigins.includes(`https://${authorizationDomain}`)
  )
    throw Error('Provide the approved authorization domain from the delivered configuration.');
  if (
    ![version, connectorVersion].every((value) =>
      /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(value),
    )
  )
    throw Error('Exact CLI and connector release versions are required.');
  const platforms = (command) =>
    Object.fromEntries(
      ['darwin', 'linux', 'win32'].map((platform) => [platform, command(platform)]),
    );
  return {
    'connector-meta.json': {
      name: '同花顺金融数据 CLI',
      name_zh: '同花顺金融数据 CLI',
      name_en: 'HiThink Finance CLI',
      description:
        '用自然语言查询同花顺金融数据，覆盖行情、财报、估值、指数、基金、期货期权与资讯；支持多标的对比、历史数据导出和本地 SQL 分析，帮助快速查数据、做比较、整理研究资料。',
      description_zh:
        '用自然语言查询同花顺金融数据，覆盖行情、财报、估值、指数、基金、期货期权与资讯；支持多标的对比、历史数据导出和本地 SQL 分析，帮助快速查数据、做比较、整理研究资料。',
      description_en:
        'Query market data, financials and news; compare assets and export data for local SQL analysis.',
      source: 'hithink-finance',
      type: 'cli',
      version: connectorVersion,
      minWorkbuddyVersion: '4.24.0',
      examples_zh: [
        '查询贵州茅台（600519.SH）的最新行情，列出价格、涨跌幅和数据时间。',
        '用表格对比贵州茅台（600519.SH）和五粮液（000858.SZ）的市盈率（TTM）和市净率（MRQ）。',
        '查询贵州茅台（600519.SH）最近一期年报的营业收入和归母净利润，注明报告期。',
        '将沪深300（000300.SH）最近5个已收盘交易日的日线行情导出为CSV，告诉我文件路径。',
        '查询沪深300ETF（510300.SH）的基金名称、管理公司和基金经理。',
      ],
      examples_en: [
        'Show the latest price, percentage change and data time for Kweichow Moutai (600519.SH).',
        'Compare PE (TTM) and PB (MRQ) for Kweichow Moutai (600519.SH) and Wuliangye (000858.SZ) in a table.',
        "Show revenue and net profit attributable to owners of the parent from Kweichow Moutai's (600519.SH) latest annual report, including the report period.",
        'Export CSI 300 (000300.SH) daily bars for the latest five completed trading days to CSV and share the file path.',
        'Show the fund name, management company and fund managers for CSI 300 ETF (510300.SH).',
      ],
    },
    'cli.json': {
      runtime: { type: 'node', version: '22' },
      npmRegistries: ['https://registry.npmmirror.com', 'https://registry.npmjs.org'],
      init: platforms(() => 'npm install -g @hithink-tech/hithink-finance-cli@latest'),
      versionCheck: {
        command: platforms((p) => `hithink-finance${p === 'win32' ? '.cmd' : ''} --version`),
        minVersion: version,
      },
      authWaitForExit: true,
      auth: platforms(
        (p) =>
          `hithink-finance${p === 'win32' ? '.cmd' : ''} auth login --method oauth --no-browser`,
      ),
      status: platforms(
        (p) => `hithink-finance${p === 'win32' ? '.cmd' : ''} auth status --format json`,
      ),
      unAuth: platforms(
        (p) => `hithink-finance${p === 'win32' ? '.cmd' : ''} auth logout --all --format json`,
      ),
      statusMatch: '"connected"\\s*:\\s*true',
      authUrlDomain: authorizationDomain,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [destination, domain, connectorVersion] = process.argv.slice(2);
  if (!destination)
    throw Error(
      'Usage: node scripts/package-workbuddy.mjs <new-output-directory> <approved-auth-domain> [connector-version]',
    );
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const files = connectorFiles(deliveredOAuthConfig(), version, domain, connectorVersion);
  await mkdir(destination);
  for (const [name, value] of Object.entries(files))
    await writeFile(path.join(destination, name), JSON.stringify(value, null, 2) + '\n');
  await cp(path.join(root, 'skills'), path.join(destination, 'skills'), {
    recursive: true,
    errorOnExist: true,
  });
  await cp(path.join(root, 'assets/workbuddy/icon.png'), path.join(destination, 'icon.png'));
}
