import { defineTool } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createAccount } from './account.js';
import { accountHost, accountNamespace } from './account-remote.js';
import { createCliRunner, FinanceError, publicError, resolveCliPackage } from './cli.js';
import { createDataManagement } from './data-management.js';
import { dataNamespace, dataRemote } from './data-remote.js';
import { createRender, renderTool } from './render.js';
import { mountFinanceShell } from './shell.js';
import { mountFinanceSkills } from './skills.js';
import { createWorkbench, mountWorkbenchService, workbenchImportTool } from './workbench.js';
import { workbenchHost } from './workbench-remote.js';
import { getTemplateHtml, getTemplateSample, workbenchTemplates } from './workbench-templates.js';

export const name = 'hithink-finance';
export const inject = ['tools', 'skills'];

export async function apply(ctx) {
  const cliPackage = resolveCliPackage();
  await mountFinanceSkills(ctx, cliPackage.directory);
  mountFinanceShell(ctx, cliPackage.entry);

  const lifetime = new AbortController();
  const cli = createCliRunner({ resolvePackage: () => cliPackage });
  const account = createAccount(cli, lifetime.signal);
  const data = createDataManagement({ cli, signal: lifetime.signal });
  const workbench = createWorkbench({
    cli, profileDirectory: ctx.get('profileContext')?.dir, signal: lifetime.signal,
    templates: workbenchTemplates, getTemplateHtml, getTemplateSample,
  });
  function getWorkspacePolicy(exec) {
    const session = exec.agent?.session;
    return session ? ctx.get('sandboxPolicy')?.resolve({ session }) : undefined;
  }
  const execute = createRender({ signal: lifetime.signal, getWorkspacePolicy });
  const pending = new Set();
  ctx.tools.register(defineTool({
    ...renderTool((args, exec) => {
      const operation = execute(args, exec);
      pending.add(operation);
      return operation.finally(() => pending.delete(operation));
    }),
    timeoutMs: 10_000,
  }));
  ctx.tools.register(workbenchImportTool(workbench, getWorkspacePolicy));

  mountFinanceBridge(ctx, account, workbench, data);
  const syncClock = setInterval(() => { void data.tick().catch(() => {}); }, 15_000);
  syncClock.unref();
  void data.tick().catch(() => {});
  ctx.effect(() => async () => {
    clearInterval(syncClock);
    lifetime.abort();
    await Promise.allSettled([account.close(), workbench.close(), data.close(), ...pending]);
  });
}

async function dataReply(run) {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}

export function mountFinanceBridge(ctx, account, workbench, data) {
  return ctx.inject(['typert'], (bridge) => {
    bridge.typert.register({ ...accountHost, invocations: [
      ...accountHost.invocations, ...workbenchHost.invocations, ...(data ? dataRemote.descriptors : []),
    ] });
    mountWorkbenchService(bridge, workbench);
    if (data) {
      bridge.plugin(class FinanceDataService extends TypertRemoteService {
        constructor(serviceCtx) {
          super(serviceCtx, dataNamespace);
        }

        status() {
          return dataReply(() => data.status());
        }

        run(action, expectedDatabasePath) {
          return this.fromUi(() => data.start(action, expectedDatabasePath));
        }

        setSchedule(schedule) {
          return this.fromUi(() => data.configure(schedule));
        }

        fromUi(operation) {
          return dataReply(() => {
            if (!this.ctx.invocation?.peer.id)
              throw new FinanceError('FINANCE_UI_REQUIRED', '请从插件的本地数据设置操作。');
            return operation();
          });
        }
      });
    }
    bridge.plugin(class FinanceAccountService extends TypertRemoteService {
      constructor(serviceCtx) {
        super(serviceCtx, accountNamespace);
      }

      status() {
        return account.status();
      }

      start(requesterId, signal) {
        return account.start(this.ctx.invocation?.peer.id, requesterId, signal);
      }

      cancel(requesterId, attemptId) {
        return account.cancel(this.ctx.invocation?.peer.id, requesterId, attemptId);
      }

      loginApiKey(key) {
        return account.loginApiKey(this.ctx.invocation?.peer.id, key);
      }

      selectMethod(method) {
        return account.selectMethod(this.ctx.invocation?.peer.id, method);
      }

      logout(confirm) {
        return account.signOut(this.ctx.invocation?.peer.id, confirm);
      }
    });
  });
}
