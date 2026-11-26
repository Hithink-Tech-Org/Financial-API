import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const BIN_KEY = 'DSH_HITHINK_FINANCE_BIN';
const ENTRY_KEY = 'DSH_HITHINK_FINANCE_ENTRY';
const NODE_KEY = 'DSH_HITHINK_FINANCE_NODE';

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function mountFinanceShell(ctx, entry) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-hithink-finance-'));
  const windows = process.platform === 'win32';
  const launcher = join(directory, windows ? 'hithink-finance.cmd' : 'hithink-finance');
  const node = process.execPath;
  const electron = Boolean(process.versions.electron);
  // The native DSH sandbox owns each command; the CLI runs in its foreground process.
  const command = windows
    ? `@setlocal DisableDelayedExpansion\r\n@set "HITHINK_FINANCE_NO_WORKER=1"\r\n@set "HITHINK_FINANCE_NO_UPDATE_CHECK=1"\r\n${electron ? '@set "ELECTRON_RUN_AS_NODE=1"\r\n' : ''}@"%${NODE_KEY}%" "%${ENTRY_KEY}%" %*\r\n`
    : `#!/bin/sh\nexport HITHINK_FINANCE_NO_WORKER=1 HITHINK_FINANCE_NO_UPDATE_CHECK=1${electron ? ' ELECTRON_RUN_AS_NODE=1' : ''}\nexec ${shellQuote(node)} ${shellQuote(entry)} "$@"\n`;
  try {
    writeFileSync(launcher, command, { flag: 'wx', mode: 0o700 });
  } catch (error) {
    rmSync(launcher, { force: true });
    rmdirSync(directory);
    throw error;
  }

  const prior = process.env.PATH;
  const profile = ctx.get('profileContext');
  // A named DSH profile owns its process; the host's frozen launch snapshot stays intact.
  const expose = profile !== undefined && !directory.includes(delimiter);
  if (expose) process.env.PATH = prior ? `${directory}${delimiter}${prior}` : directory;
  ctx.effect(() => () => {
    if (expose) {
      const current = process.env.PATH;
      if (current !== undefined) {
        const paths = current.split(delimiter);
        const index = paths.indexOf(directory);
        if (index !== -1) {
          paths.splice(index, 1);
          if (paths.length) process.env.PATH = paths.join(delimiter);
          else if (prior === '') process.env.PATH = '';
          else delete process.env.PATH;
        }
      }
    }
    rmSync(launcher, { force: true });
    rmdirSync(directory);
  });
  ctx.inject(['shellEnv'], (shellCtx) => {
    const variables = { [BIN_KEY]: { description: '本 DSH 插件自带的同花顺金融数据 CLI 命令目录。' } };
    const values = { [BIN_KEY]: directory };
    if (windows) {
      variables[ENTRY_KEY] = { description: '插件安装包内同花顺金融数据 CLI 的入口文件。' };
      variables[NODE_KEY] = { description: '运行插件自带同花顺金融数据 CLI 的 Node.js。' };
      values[ENTRY_KEY] = entry;
      values[NODE_KEY] = node;
    }
    shellCtx.shellEnv.register({
      name: 'hithink-finance-cli',
      variables,
      resolve: () => values,
    });
  });
}
